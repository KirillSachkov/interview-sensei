import { checkHealth } from "@interview-sensei/core/health";
import type { Clock } from "@interview-sensei/core/time";
import { fastify } from "fastify";
import type { FastifyInstance } from "fastify";

export interface ServerDependencies {
  clock: Clock;
  /** Fastify request logging; off in tests. */
  logger?: boolean;
}

/** Builds the HTTP server without listening, so tests call it in process. */
export function buildServer({ clock, logger = false }: ServerDependencies): FastifyInstance {
  const server = fastify({ logger });
  server.get("/api/health", () => checkHealth(clock));
  return server;
}
