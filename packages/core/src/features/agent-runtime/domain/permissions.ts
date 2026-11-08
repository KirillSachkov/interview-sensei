// Which permission requests the server answers by itself. It allows only tools of our own MCP
// server and recognizes them by the structural fields that the agent's adapter sets. Display text
// such as `title` never counts: a shell command can mention our server name in a path (#4).
import type { AgentKind } from "./agent.ts";
import type { PermissionAnswer, PermissionOption, ToolCallFields } from "./ports.ts";

/** The value of an object's own field, or undefined for other values. */
function field(value: unknown, key: string): unknown {
  return typeof value === "object" && value !== null
    ? Object.entries(value).find(([name]) => name === key)?.[1]
    : undefined;
}

/**
 * The MCP server that the tool call belongs to, read from the adapter's structural fields; null
 * when the adapter marks no MCP server. #24 adds the fields of Claude Code, Codex and OpenCode.
 */
function mcpServerOf(agent: AgentKind, toolCall: ToolCallFields): string | null {
  switch (agent) {
    case "fake": {
      // The fake agent marks its MCP calls with `_meta.fakeAgent.mcpServer`.
      const server = field(field(field(toolCall, "_meta"), "fakeAgent"), "mcpServer");
      return typeof server === "string" ? server : null;
    }
    default: {
      return agent satisfies never;
    }
  }
}

/**
 * The server's own answer to a permission request, or null when the Candidate decides. The
 * request's tool call and the `tool_call` the agent announced earlier with the same `toolCallId`
 * are both checked: adapters put the structural fields in either of them.
 */
export function automaticAnswer({
  agent,
  ourServer,
  toolCalls,
  options,
}: {
  agent: AgentKind;
  ourServer: string;
  /** The request's tool call and the announced one with the same id, when there is one. */
  toolCalls: readonly ToolCallFields[];
  options: readonly PermissionOption[];
}): PermissionAnswer | null {
  const servers = toolCalls.map((toolCall) => mcpServerOf(agent, toolCall));
  const marked = servers.filter((server) => server !== null);
  if (marked.length === 0 || marked.some((server) => server !== ourServer)) {
    return null;
  }
  const allow = options.find((option) => option.kind === "allow_once");
  return allow === undefined ? null : { outcome: "selected", optionId: allow.optionId };
}
