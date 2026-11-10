import type { FastifyInstance } from "fastify";

import { registerAnswerRoutes } from "./answer-routes.ts";
import { registerInboxRoutes } from "./inbox-routes.ts";

/** The routes of the agent's background work on a Target: Inbox processing and answer search. */
export function registerBackgroundRoutes(
  server: FastifyInstance,
  dependencies: Parameters<typeof registerInboxRoutes>[1] &
    Parameters<typeof registerAnswerRoutes>[1],
) {
  registerInboxRoutes(server, dependencies);
  registerAnswerRoutes(server, dependencies);
}
