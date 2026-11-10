import { fastifyWebsocket } from "@fastify/websocket";
import type { FastifyInstance } from "fastify";

import type { Features } from "./composition.ts";
import { acceptLocalRequestsOnly } from "./local-requests.ts";

type LifecycleFeatures = Pick<
  Features,
  "storage" | "sessions" | "interviews" | "sources" | "answers" | "transcription"
>;

/**
 * What the last run of the server left: its sessions end, its running Mock interviews pause, its
 * answer searches and Inbox processing close with partial reports, its temporary audio goes, and
 * so do the files of a Target whose deletion it did not finish: its sessions' directories and its
 * materials.
 */
async function endLastRun({
  sessions,
  interviews,
  sources,
  answers,
  transcription,
}: LifecycleFeatures): Promise<void> {
  await sessions.endInterrupted();
  await interviews.pauseInterrupted();
  // Before the Inbox processing: its closed runs would begin the waiting answer searches.
  await answers.endInterrupted();
  await sources.inbox.endInterrupted();
  await transcription.removeLeftovers();
  await sessions.removeLeftovers();
  await sources.removeLeftovers();
}

/**
 * Ends sessions of the last run, pauses its running Mock interviews, closes its answer searches
 * and its running Inbox processing with partial reports, deletes the temporary audio of its
 * transcriptions and the files of a deletion it did not finish, and registers the shutdown order, the WebSocket plugin and the check that only
 * the Candidate's own browser reaches the server.
 */
export async function prepare(
  server: FastifyInstance,
  {
    features,
    allowedOrigins,
    exemptRoutes,
  }: {
    features: LifecycleFeatures;
    allowedOrigins: readonly string[];
    /** Routes with their own Host and Origin checks; see acceptLocalRequestsOnly. */
    exemptRoutes: readonly string[];
  },
) {
  const { storage, sessions, interviews, sources, answers, transcription } = features;
  acceptLocalRequestsOnly(server, { allowedOrigins, exemptRoutes });
  // Agents stop and their sessions end before the final dump closes the database. Running Mock
  // interviews pause first, so their time stops now. A started Inbox processing first finishes
  // reading its texts and hands its agent to the sessions; so does a started answer search.
  server.addHook("onClose", async () => {
    try {
      await interviews.pauseRunning();
      await transcription.close();
      await sources.inbox.settle();
      await answers.settle();
      await sessions.close();
    } finally {
      await storage.close();
    }
  });
  try {
    await endLastRun(features);
    await server.register(fastifyWebsocket);
  } catch (error) {
    await storage.close();
    throw error;
  }
}
