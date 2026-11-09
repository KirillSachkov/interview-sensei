import path from "node:path";

import { fastifyStatic } from "@fastify/static";
import type { FastifyInstance } from "fastify";

/** A page route of the web router: no `/api` prefix and no file extension in the last segment. */
function isPageRoute(url: string): boolean {
  const { pathname } = new URL(url, "http://localhost");
  const isApi = pathname === "/api" || pathname.startsWith("/api/");
  return !isApi && path.posix.extname(pathname) === "";
}

/**
 * Serves the built web app from `webDirectory`, the output of `vite build`, beside `/api`. A
 * page route without a file gets index.html, so the web router handles it; an unknown API path
 * or a missing asset stays a 404. When registration fails, it closes the server, which stops the
 * agents and releases the data directory, and rethrows.
 */
export async function registerWebApp(server: FastifyInstance, webDirectory: string) {
  try {
    await server.register(fastifyStatic, { root: webDirectory });
  } catch (error) {
    await server.close();
    throw error;
  }
  server.setNotFoundHandler((request, reply) => {
    if ((request.method === "GET" || request.method === "HEAD") && isPageRoute(request.url)) {
      return reply.sendFile("index.html");
    }
    return reply.code(404).send({
      message: `Route ${request.method}:${request.url} not found`,
      error: "Not Found",
      statusCode: 404,
    });
  });
}
