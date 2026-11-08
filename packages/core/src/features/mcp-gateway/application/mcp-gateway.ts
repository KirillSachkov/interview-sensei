import type { SessionTool, ToolSession } from "../../../shared/mcp/index.ts";
import type { McpAddress } from "../domain/mcp-address.ts";
import { mcpUrl, sessionMcpServerName } from "../domain/mcp-address.ts";
import type { McpEndpoint } from "../domain/ports.ts";

export interface McpGatewayDependencies {
  /** The tool set of a session kind. */
  readonly toolsFor: (kind: string) => readonly SessionTool[];
  /** The server's own origin, such as `http://127.0.0.1:4310`; known once the server listens. */
  readonly origin: () => string;
  /** A new secret token; nobody can derive one address from another or from a session id. */
  readonly newToken: () => string;
  /** A new random suffix for the session's MCP server name. */
  readonly newNameSuffix: () => string;
  /** Serves the tools to the session over MCP. */
  readonly serve: (tools: readonly SessionTool[], session: ToolSession) => McpEndpoint;
}

/** Gives each AgentSession its own MCP address with the tool set of its kind. */
export interface McpGateway {
  /** Opens the session's address; throws when the server does not listen yet. */
  readonly open: (session: ToolSession) => McpAddress;
  /** Closes the session's address; later requests to it get 404. */
  readonly close: (sessionId: string) => Promise<void>;
  /** The endpoint of an open address, or undefined for a token it never gave or closed. */
  readonly endpoint: (token: string) => McpEndpoint | undefined;
}

interface OpenAddress {
  readonly token: string;
  readonly endpoint: McpEndpoint;
}

export function createMcpGateway({
  toolsFor,
  origin,
  newToken,
  newNameSuffix,
  serve,
}: McpGatewayDependencies): McpGateway {
  const bySession = new Map<string, OpenAddress>();
  const byToken = new Map<string, McpEndpoint>();
  return {
    open: (session) => {
      // Throws before anything opens when the server does not listen yet.
      const serverOrigin = origin();
      const token = newToken();
      const endpoint = serve(toolsFor(session.kind), session);
      bySession.set(session.sessionId, { token, endpoint });
      byToken.set(token, endpoint);
      return { name: sessionMcpServerName(newNameSuffix()), url: mcpUrl(serverOrigin, token) };
    },
    close: async (sessionId) => {
      const address = bySession.get(sessionId);
      if (address !== undefined) {
        bySession.delete(sessionId);
        byToken.delete(address.token);
        await address.endpoint.close();
      }
    },
    endpoint: (token) => byToken.get(token),
  };
}
