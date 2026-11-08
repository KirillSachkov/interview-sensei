import { sessionKinds } from "@interview-sensei/core/agent-sessions";
import type { SessionKind } from "@interview-sensei/core/agent-sessions";
import {
  createMcpGateway,
  getBrief,
  mcpRoute,
  randomNameSuffix,
  randomToken,
  streamableHttpEndpoint,
} from "@interview-sensei/core/mcp-gateway";
import type { McpGateway, SessionTool } from "@interview-sensei/core/mcp-gateway";
import type { FastifyInstance, FastifyRequest } from "fastify";

/**
 * The MCP tool set of each session kind. A slice exports its tools from its index.ts; add them to
 * the kinds that need them.
 */
const sessionTools: Readonly<Record<SessionKind, readonly SessionTool[]>> = {
  "service-chat": [getBrief],
};

function toolsFor(kind: string): readonly SessionTool[] {
  const known = sessionKinds.find((candidate) => candidate === kind);
  return known === undefined ? [] : sessionTools[known];
}

/**
 * The loopback origin of the server's port, for the MCP addresses; throws before it listens. The
 * agent runs on this machine and connects to an address the server listens on: the IPv4 loopback
 * when the server has one, as on `localhost`, and the IPv6 loopback otherwise, as on `::1`.
 */
function loopbackOrigin(server: FastifyInstance): string {
  const addresses = server.addresses();
  const address = addresses.find(({ family }) => family === "IPv4") ?? addresses[0];
  if (address === undefined) {
    throw new Error("The server does not listen yet, so it has no MCP address");
  }
  return address.family === "IPv4"
    ? `http://127.0.0.1:${address.port}`
    : `http://[::1]:${address.port}`;
}

/** The Fastify request as a web-standard one; the parsed JSON body goes apart. */
function webRequest(request: FastifyRequest): Request {
  const headers = new Headers();
  for (const [name, value] of Object.entries(request.headers)) {
    for (const item of Array.isArray(value) ? value : [value]) {
      if (item !== undefined) {
        headers.append(name, item);
      }
    }
  }
  const url = new URL(request.url, `http://${request.host}`);
  return new Request(url, { method: request.method, headers });
}

/**
 * Gives each AgentSession its own MCP address with the tools of its kind and serves them over
 * streamable HTTP at `/mcp/<token>`. An address that the gateway never gave or has closed gets 404.
 */
export function mountMcpGateway(server: FastifyInstance): McpGateway {
  const gateway = createMcpGateway({
    toolsFor,
    origin: () => loopbackOrigin(server),
    newToken: randomToken,
    newNameSuffix: randomNameSuffix,
    serve: (tools, session) =>
      streamableHttpEndpoint(tools, session, {
        onError: (error) => {
          server.log.warn({ err: error }, "An MCP request failed");
        },
      }),
  });
  server.route<{ Params: { token: string } }>({
    method: ["GET", "POST", "DELETE"],
    url: mcpRoute,
    handler: async (request, reply) => {
      const endpoint = gateway.endpoint(request.params.token);
      if (endpoint === undefined) {
        return reply.code(404).send({ error: "mcp_address_not_found" });
      }
      return endpoint.handle(webRequest(request), request.body);
    },
  });
  return gateway;
}
