import { fastifyWebsocket } from "@fastify/websocket";
import type { AgentSessions } from "@interview-sensei/core/agent-sessions";
import type { Storage } from "@interview-sensei/core/storage";
import type { FastifyInstance } from "fastify";

import { acceptLocalRequestsOnly } from "./local-requests.ts";

/**
 * Ends sessions of the last run and registers the shutdown order, the WebSocket plugin and the
 * check that only the Candidate's own browser reaches the server.
 */
export async function prepare(
  server: FastifyInstance,
  {
    storage,
    sessions,
    allowedOrigins,
  }: { storage: Storage; sessions: AgentSessions; allowedOrigins: readonly string[] },
) {
  acceptLocalRequestsOnly(server, { allowedOrigins });
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
