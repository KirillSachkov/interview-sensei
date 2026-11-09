/** The name our MCP server gives itself in the MCP handshake. */
export const mcpImplementationName = "interview-sensei";

/**
 * The name of a session's MCP server in `session/new`; agents show its tools under this name. The
 * random suffix keeps it apart from a server named `interview-sensei` in the Candidate's agent
 * config, whose tools the server must not allow by itself.
 */
export function sessionMcpServerName(suffix: string): string {
  return `${mcpImplementationName}-${suffix}`;
}

/** The MCP server of one AgentSession, as the agent gets it in `session/new`. */
export interface McpAddress {
  readonly name: string;
  readonly url: string;
}

/** The server route of every MCP address; `token` tells the addresses apart. */
export const mcpRoute = "/mcp/:token";

/** The URL of the address with the token on the server's origin. */
export function mcpUrl(origin: string, token: string): string {
  return `${origin}/mcp/${token}`;
}
