import { fastifyWebsocket } from "@fastify/websocket";
import type { FastifyInstance } from "fastify";

import type { Features } from "./composition.ts";
import { acceptLocalRequestsOnly } from "./local-requests.ts";

/**
 * Ends sessions of the last run, marks its running Mock interviews «прерван», closes its running
 * Inbox processing with partial reports, and registers the
 * shutdown order, the WebSocket plugin and the check that only the Candidate's own browser reaches
 * the server.
 */
export async function prepare(
  server: FastifyInstance,
  {
    features: { storage, sessions, interviews, sources, transcription },
    allowedOrigins,
    exemptRoutes,
  }: {
    features: Pick<Features, "storage" | "sessions" | "interviews" | "sources" | "transcription">;
    allowedOrigins: readonly string[];
    /** Routes with their own Host and Origin checks; see acceptLocalRequestsOnly. */
    exemptRoutes: readonly string[];
  },
) {
  acceptLocalRequestsOnly(server, { allowedOrigins, exemptRoutes });
  // Agents stop and their sessions end before the final dump closes the database. A started Inbox
  // processing first finishes reading its texts and hands its agent to the sessions.
  server.addHook("onClose", async () => {
    try {
      await transcription.close();
      await sources.inbox.settle();
      await sessions.close();
    } finally {
      await storage.close();
    }
  });
  try {
    await sessions.endInterrupted();
    await interviews.endInterrupted();
    await sources.inbox.endInterrupted();
    await server.register(fastifyWebsocket);
  } catch (error) {
    await storage.close();
    throw error;
  }
}
