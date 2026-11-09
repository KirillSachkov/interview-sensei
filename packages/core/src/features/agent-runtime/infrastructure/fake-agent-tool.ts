// The fake agent's `/tool <name> <json>`: API tests drive the agent's work with our MCP tools by it.
// `/brief` calls `get_brief` the same way; `/tool-list` lists the tools.
import { randomUUID } from "node:crypto";

import type { AgentContext } from "@agentclientprotocol/sdk/unstable";

import { callMcpTool, listMcpTools } from "./fake-agent-mcp.ts";
import { askPermission } from "./fake-agent-permission.ts";

/** The tool name and the arguments text of `/tool <name> <json>`, or null for other text. */
export function toolCommand(text: string): { name: string; args: string } | null {
  const match = /^\/tool (?<name>\S+)(?: (?<args>.*))?$/su.exec(text.trim());
  return match?.groups?.name === undefined
    ? null
    : { name: match.groups.name, args: match.groups.args ?? "{}" };
}

function parseArguments(text: string): Record<string, unknown> {
  const args: unknown = JSON.parse(text);
  if (typeof args !== "object" || args === null || Array.isArray(args)) {
    throw new Error("the arguments must be a JSON object");
  }
  return Object.fromEntries(Object.entries(args));
}

/** The tool call that the fake agent announces and asks permission for. */
export interface ToolCall {
  readonly toolCallId: string;
  readonly title: string;
  readonly kind: "other";
  readonly rawInput: Record<string, unknown>;
  readonly _meta: object;
  readonly [field: string]: unknown;
}

interface ToolCallDependencies {
  /** The session's MCP server over HTTP, from `session/new`. */
  readonly server: { readonly name: string; readonly url: string };
  /** Announces the tool call and asks permission for it; resolves with the outcome. */
  readonly ask: (
    toolCall: ToolCall,
  ) => Promise<{ outcome: "selected"; optionId: string } | { outcome: "cancelled" }>;
}

/** Asks permission for the call with our structural marker, which the server allows by itself. */
async function permitted(
  name: string,
  input: object,
  { server, ask }: ToolCallDependencies,
): Promise<boolean> {
  const outcome = await ask({
    toolCallId: randomUUID(),
    title: name,
    kind: "other",
    rawInput: Object.fromEntries(Object.entries(input)),
    // The structural field the server recognizes our MCP tools by.
    _meta: { fakeAgent: { mcpServer: server.name } },
  });
  return outcome.outcome === "selected" && outcome.optionId !== "reject-once";
}

/**
 * `/brief`: calls `get_brief` after permission. Resolves with the reply «Фейковый агент прочитал
 * brief: <brief>», or with why it could not.
 */
export async function callBrief(dependencies: ToolCallDependencies): Promise<string> {
  if (!(await permitted("get_brief", {}, dependencies))) {
    return "Фейковый агент не получил разрешения на get_brief";
  }
  try {
    const brief = await callMcpTool(dependencies.server.url, "get_brief");
    return `Фейковый агент прочитал brief: ${brief.text}`;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return `Фейковый агент не смог вызвать get_brief: ${message}`;
  }
}

/**
 * Asks permission for the call, then calls the tool. Resolves with the reply: «Результат <name>:
 * <text>» or «Ошибка <name>: <text>».
 */
export async function callTool(
  { name, args }: { name: string; args: string },
  { server, ask }: ToolCallDependencies,
): Promise<string> {
  try {
    const input = parseArguments(args);
    if (!(await permitted(name, input, { server, ask }))) {
      return `Фейковый агент не получил разрешения на ${name}`;
    }
    const result = await callMcpTool(server.url, name, input);
    return `${result.isError ? "Ошибка" : "Результат"} ${name}: ${result.text}`;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return `Ошибка ${name}: ${message}`;
  }
}

/** The session a template turn runs in, with its MCP server over HTTP. */
export interface FakeSession {
  readonly client: AgentContext;
  readonly sessionId: string;
  readonly server: { readonly name: string; readonly url: string };
}

/**
 * Calls our MCP tool in a template turn after the permission request that the server allows by
 * itself; null without permission.
 */
export async function allowedCall(
  { client, sessionId, server }: FakeSession,
  name: string,
  input: object,
): Promise<{ readonly text: string; readonly isError: boolean } | null> {
  const ask = async (toolCall: ToolCall) => askPermission(client, sessionId, toolCall);
  if (!(await permitted(name, input, { server, ask }))) {
    return null;
  }
  return callMcpTool(server.url, name, input);
}

/**
 * Calls our MCP tool in a template turn like allowedCall; rejects without permission or on the
 * tool's error. Resolves with the brief's text for get_brief, with the parsed JSON otherwise.
 */
export async function call(session: FakeSession, name: string, input: object): Promise<unknown> {
  const result = await allowedCall(session, name, input);
  if (result === null || result.isError) {
    throw new Error(result === null ? `no permission for ${name}` : `${name}: ${result.text}`);
  }
  return name === "get_brief" ? result.text : JSON.parse(result.text);
}

/** The JSON line after the heading line of a brief, such as «Target:». */
export function briefLine(brief: string, heading: string): unknown {
  const lines = brief.split("\n");
  return JSON.parse(lines[lines.indexOf(heading) + 1] ?? "null");
}

/** `/tool-list`: the reply «MCP tools: <json>» with the sorted names of the server's tools. */
export async function toolList(server: { readonly url: string }): Promise<string> {
  return `MCP tools: ${JSON.stringify(await listMcpTools(server.url))}`;
}
