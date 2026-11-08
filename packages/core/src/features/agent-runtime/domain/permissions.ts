// Which permission requests the server answers by itself. It allows only tools of our own MCP
// server and recognizes them by the structural fields that the agent's adapter sets. Display text
// such as `title` never counts: a shell command can mention our server name in a path (#4).
import type { AgentKind } from "./agent.ts";
import { isAgentKind } from "./agent.ts";
import type { PermissionAnswer, PermissionOption, ToolCallFields } from "./ports.ts";

/** The value of an object's own field, or undefined for other values. */
function field(value: unknown, key: string): unknown {
  return typeof value === "object" && value !== null
    ? Object.entries(value).find(([name]) => name === key)?.[1]
    : undefined;
}

function text(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

/**
 * How each adapter marks the MCP server of a tool call in its structural fields. Each reader
 * returns the server's name from `session/new`, or null when the tool call carries no marker.
 */
const mcpServerReaders: Readonly<Record<AgentKind, (toolCall: ToolCallFields) => string | null>> = {
  // claude-agent-acp copies the SDK's `mcpServer` of an `mcp__*` tool into the permission
  // request as `_meta.claudeCode.mcpServer`. The SDK gives a server from `session/new` the source
  // `dynamic`; servers from settings or plugins have other sources.
  claude: (toolCall) => {
    const server = field(field(field(toolCall, "_meta"), "claudeCode"), "mcpServer");
    return field(server, "source") === "dynamic" ? text(field(server, "name")) : null;
  },
  // codex-acp marks the `tool_call` of an MCP tool with `_meta.is_mcp_tool_call` and names its
  // server in `rawInput.server`; the permission request then carries only the same id and kind.
  codex: (toolCall) =>
    field(field(toolCall, "_meta"), "is_mcp_tool_call") === true
      ? text(field(field(toolCall, "rawInput"), "server"))
      : null,
  // OpenCode asks no permission for MCP tools, so it marks none.
  opencode: () => null,
  // The fake agent marks its MCP calls with `_meta.fakeAgent.mcpServer`.
  fake: (toolCall) => text(field(field(field(toolCall, "_meta"), "fakeAgent"), "mcpServer")),
};

interface PermissionCase {
  /** The agent kind; a kind this rule does not know marks no MCP server. */
  readonly agent: string;
  /** The MCP server name that this session got in `session/new`. */
  readonly ourServer: string;
  /** The tool call of the permission request. */
  readonly request: ToolCallFields;
  /** The `tool_call` the agent announced earlier with the same `toolCallId`, if any. */
  readonly announced: ToolCallFields | undefined;
  readonly options: readonly PermissionOption[];
}

/**
 * Whether the request is a call of our MCP server. Either the request itself carries our marker,
 * and the announced tool call with the same id carries no other marker; or the request carries no
 * marker, the announced tool call carries ours, and the request does not change its `kind`.
 */
function isOurCall({ agent, ourServer, request, announced }: PermissionCase): boolean {
  if (!isAgentKind(agent)) {
    return false;
  }
  const mcpServerOf = mcpServerReaders[agent];
  const requestServer = mcpServerOf(request);
  const announcedServer = announced === undefined ? null : mcpServerOf(announced);
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
export function automaticAnswer(permission: PermissionCase): PermissionAnswer | null {
  if (!isOurCall(permission)) {
    return null;
  }
  const allow = permission.options.find((option) => option.kind === "allow_once");
  return allow === undefined ? null : { outcome: "selected", optionId: allow.optionId };
}
