import type { SessionTool } from "../../shared/mcp/index.ts";
import { isSessionKind, sessionProfiles } from "../../shared/session-kinds/index.ts";
import type { SessionKind } from "../../shared/session-kinds/index.ts";
import { createMcpGateway } from "./application/mcp-gateway.ts";
import type { McpGateway } from "./application/mcp-gateway.ts";
import { randomNameSuffix, randomToken } from "./infrastructure/random-token.ts";
import { streamableHttpEndpoint } from "./infrastructure/streamable-http-endpoint.ts";

export interface McpGatewayModuleDependencies {
  /**
   * The MCP tool set of each session kind. It compiles only while every kind in
   * `shared/session-kinds` has an entry; a kind without tools gets an empty list.
   */
  readonly tools: Readonly<Record<SessionKind, readonly SessionTool[]>>;
  /** The server's own origin, such as `http://127.0.0.1:4310`; throws before it listens. */
  readonly origin: () => string;
  /** Receives a failed MCP request; the agent gets the MCP error. */
  readonly onError: (error: Error) => void;
}

/** The MCP `instructions` of the kind's profile; none for an unknown kind. */
function instructionsFor(kind: string): string | null {
  return isSessionKind(kind) ? sessionProfiles[kind].instructions : null;
}

/**
 * Gives each AgentSession its own MCP address with the tool set and the instructions of its kind,
 * served over streamable HTTP. A session of an unknown kind gets no tools and no instructions. The HTTP server routes `mcpRoute`
 * to `endpoint(token)`.
 */
export function mcpGatewayModule({
  tools,
  origin,
  onError,
}: McpGatewayModuleDependencies): McpGateway {
  return createMcpGateway({
    toolsFor: (kind) => (isSessionKind(kind) ? tools[kind] : []),
    origin,
    newToken: randomToken,
    newNameSuffix: randomNameSuffix,
    serve: (sessionTools, session) =>
      streamableHttpEndpoint(sessionTools, session, {
        onError,
        instructions: instructionsFor(session.kind),
      }),
  });
}
