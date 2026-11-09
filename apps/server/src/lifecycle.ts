import { fastifyWebsocket } from "@fastify/websocket";
import type { FastifyInstance } from "fastify";

import type { Features } from "./composition.ts";
import { acceptLocalRequestsOnly } from "./local-requests.ts";

/**
 * Ends sessions of the last run and registers the shutdown order, the WebSocket plugin and the
 * check that only the Candidate's own browser reaches the server.
 */
export async function prepare(
  server: FastifyInstance,
  {
    features: { storage, sessions },
    allowedOrigins,
    exemptRoutes,
  }: {
    features: Pick<Features, "storage" | "sessions">;
    allowedOrigins: readonly string[];
    /** Routes with their own Host and Origin checks; see acceptLocalRequestsOnly. */
    exemptRoutes: readonly string[];
  },
) {
  acceptLocalRequestsOnly(server, { allowedOrigins, exemptRoutes });
  // Agents stop and their sessions end before the final dump closes the database.
  server.addHook("onClose", async () => {
    try {
      await sessions.close();
    } finally {
      await storage.close();
    }
  });
  try {
    await sessions.endInterrupted();
    await server.register(fastifyWebsocket);
  } catch (error) {
    await storage.close();
    throw error;
  }
}
