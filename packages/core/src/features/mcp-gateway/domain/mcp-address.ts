/** The name of our MCP server in `session/new`; agents show its tools under this name. */
export const mcpServerName = "interview-sensei";

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
