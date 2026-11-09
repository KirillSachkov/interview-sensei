// The fake agent's `/tool <name> <json>`: API tests drive the agent's work with our MCP tools by it.
// `/brief` calls `get_brief` the same way.
import { randomUUID } from "node:crypto";

import { callMcpTool } from "./fake-agent-mcp.ts";

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
  input: Record<string, unknown>,
  { server, ask }: ToolCallDependencies,
): Promise<boolean> {
  const outcome = await ask({
    toolCallId: randomUUID(),
    title: name,
    kind: "other",
    rawInput: input,
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
