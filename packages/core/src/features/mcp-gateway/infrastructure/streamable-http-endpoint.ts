import {
  createMcpHandler,
  hostHeaderValidationResponse,
  localhostAllowedHostnames,
  localhostAllowedOrigins,
  McpServer,
  originValidationResponse,
} from "@modelcontextprotocol/server";

import type { SessionTool, ToolSession } from "../../../shared/mcp/index.ts";
import { mcpImplementationName } from "../domain/mcp-address.ts";
import type { McpEndpoint } from "../domain/ports.ts";

function mcpServer(
  tools: readonly SessionTool[],
  session: ToolSession,
  instructions: string | null,
): McpServer {
  const server = new McpServer(
    { name: mcpImplementationName, version: "0.0.0" },
    instructions === null ? {} : { instructions },
  );
  for (const tool of tools) {
    server.registerTool(
      tool.name,
      { description: tool.description, inputSchema: tool.input },
      async (input) => ({ content: [{ type: "text", text: await tool.run(input, session) }] }),
    );
  }
  return server;
}

/**
 * Serves the tools and the instructions to one session over stateless streamable HTTP. It answers
 * both the 2025 MCP revisions that agents speak now and the 2026-07-28 revision. Only loopback
 * hosts and origins pass, so a web page cannot reach the address through DNS rebinding.
 */
export function streamableHttpEndpoint(
  tools: readonly SessionTool[],
  session: ToolSession,
  { onError, instructions }: { onError: (error: Error) => void; instructions: string | null },
): McpEndpoint {
  // The SDK asks for a new server instance for each request.
  const handler = createMcpHandler(() => mcpServer(tools, session, instructions), {
    onerror: onError,
  });
  return {
    handle: async (request, body) =>
      hostHeaderValidationResponse(request, localhostAllowedHostnames()) ??
      originValidationResponse(request, localhostAllowedOrigins()) ??
      handler.fetch(request, { parsedBody: body }),
    close: async () => handler.close(),
  };
}
