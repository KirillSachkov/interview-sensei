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
 * when the adapter marks no MCP server or the agent kind is unknown. #24 adds the fields of Claude
 * Code, Codex and OpenCode.
 */
function mcpServerOf(agent: AgentKind, toolCall: ToolCallFields): string | null {
  switch (agent) {
    case "fake": {
      // The fake agent marks its MCP calls with `_meta.fakeAgent.mcpServer`.
      const server = field(field(field(toolCall, "_meta"), "fakeAgent"), "mcpServer");
      return typeof server === "string" ? server : null;
    }
    default: {
      agent satisfies never;
      return null;
    }
  }
}

/**
 * Whether the request is a call of our MCP server. Either the request itself carries our marker,
 * and the announced tool call with the same id carries no other marker; or the request carries no
 * marker, the announced tool call carries ours, and the request does not change its `kind`.
 */
function isOurCall(
  agent: AgentKind,
  ourServer: string,
  request: ToolCallFields,
  announced: ToolCallFields | undefined,
): boolean {
  const requestServer = mcpServerOf(agent, request);
  const announcedServer = announced === undefined ? null : mcpServerOf(agent, announced);
  if (requestServer !== null) {
    return requestServer === ourServer && (announcedServer ?? ourServer) === ourServer;
  }
  return (
    announcedServer === ourServer &&
    (request.kind === undefined || request.kind === announced?.kind)
  );
}

/**
 * The server's own answer to a permission request, or null when the Candidate decides. It picks
 * only `allow_once`, so the agent never remembers a permission beyond this call.
 */
export function automaticAnswer({
  agent,
  ourServer,
  request,
  announced,
  options,
}: {
  agent: AgentKind;
  /** The MCP server name that this session got in `session/new`. */
  ourServer: string;
  /** The tool call of the permission request. */
  request: ToolCallFields;
  /** The `tool_call` the agent announced earlier with the same `toolCallId`, if any. */
  announced: ToolCallFields | undefined;
  options: readonly PermissionOption[];
}): PermissionAnswer | null {
  if (!isOurCall(agent, ourServer, request, announced)) {
    return null;
  }
  const allow = options.find((option) => option.kind === "allow_once");
  return allow === undefined ? null : { outcome: "selected", optionId: allow.optionId };
}
