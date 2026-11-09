import type { FastifyInstance, FastifyRequest } from "fastify";

import { isLoopbackHost } from "./loopback.ts";

/** A loopback URL authority, such as `127.0.0.1:4310`, parsed; null when it is not loopback. */
function loopbackPort(authority: string): number | null {
  try {
    const url = new URL(`http://${authority}`);
    if (!isLoopbackHost(url.hostname) || url.username !== "" || url.pathname !== "/") {
      return null;
    }
    return Number(url.port === "" ? "80" : url.port);
  } catch {
    return null;
  }
}

/** Whether the origin is a loopback page on the server's port: the app the server serves. */
function isOwnOrigin(origin: string, port: number): boolean {
  if (!origin.startsWith("http://")) {
    return false;
  }
  const authority = origin.slice("http://".length);
  return loopbackPort(authority) === port;
}

/** Requests that change state or open the session WebSocket need the Candidate's page as origin. */
function needsOrigin(request: FastifyRequest): boolean {
  const reads = request.method === "GET" || request.method === "HEAD";
  return !reads || request.headers.upgrade?.toLowerCase() === "websocket";
}

/** Why the request does not come from the Candidate's own browser, or null when it does. */
function refusal(
  request: FastifyRequest,
  { ports, allowedOrigins }: { ports: ReadonlySet<number>; allowedOrigins: readonly string[] },
): "foreign_host" | "foreign_origin" | null {
  const port = loopbackPort(request.headers.host ?? "");
  // A server that does not listen yet takes only in-process test requests, which have no port.
  if (port === null || (ports.size > 0 && !ports.has(port))) {
    return "foreign_host";
  }
  const { origin } = request.headers;
  if (origin === undefined) {
    return needsOrigin(request) ? "foreign_origin" : null;
  }
  return isOwnOrigin(origin, port) || allowedOrigins.includes(origin) ? null : "foreign_origin";
}

/**
 * Answers only the Candidate's own browser, against DNS rebinding and other sites' pages (#23).
 * Every request needs a loopback Host with the server's port. A request with an Origin, and every
 * request other than GET or HEAD or that opens a WebSocket, needs the server's own loopback
 * origin or one of `allowedOrigins`, such as the Vite dev server of `pnpm dev`. Others get 403.
 * `exemptRoutes`, such as the MCP addresses, keep their own Host and Origin checks: agents send
 * no Origin.
 */
export function acceptLocalRequestsOnly(
  server: FastifyInstance,
  {
    allowedOrigins,
    exemptRoutes,
  }: { allowedOrigins: readonly string[]; exemptRoutes: readonly string[] },
): void {
  server.addHook("onRequest", async (request, reply) => {
    const route = request.routeOptions.url;
    if (route !== undefined && exemptRoutes.includes(route)) {
      return;
    }
    const ports = new Set(server.addresses().map((address) => address.port));
    const error = refusal(request, { ports, allowedOrigins });
    if (error !== null) {
      if (request.headers.upgrade !== undefined) {
        // The HTTP server has handed the socket of an upgrade over and never closes it itself.
        reply.raw.once("finish", () => {
          request.raw.socket.end();
        });
      }
      await reply.code(403).send({ error });
    }
  });
}
