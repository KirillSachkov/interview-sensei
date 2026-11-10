// The HTTP API of the pause of a Mock interview (#84): «Пауза» and «Продолжить». The interviewer chat
// of the continuation goes through its new AgentSession, `sessionId` of the view; that session's
// chat starts with the chat of the earlier ones.
import type { FastifyInstance, FastifyReply } from "fastify";

import type { ArchiveGuard } from "./archive-guard.ts";
import type { Features, ResumeOutcome } from "./composition.ts";
import {
  continuationRequestOf,
  refuseAgent,
  startForInterview,
} from "./interview-session-start.ts";
import type { StartRefusal } from "./interview-session-start.ts";
import { params } from "./route-params.ts";

type Dependencies = Pick<Features, "interviews"> & { readonly archiveGuard: ArchiveGuard };

const pauseRefusals = {
  not_running: "Мок не идёт: он уже на паузе или завершён.",
  finishing: "Мок уже завершается: интервьюер подводит итог.",
} as const;

/** `POST /api/interviews/:id/pause`: 204, 404, or 409 with the reason. */
function registerPause(server: FastifyInstance, { interviews }: Dependencies) {
  server.post<{ Params: { id: string } }>(
    "/api/interviews/:id/pause",
    { schema: { params } },
    async (request, reply) => {
      const outcome = await interviews.pause(request.params.id);
      if (outcome === "accepted") {
        return reply.code(204).send();
      }
      return outcome === "not_found"
        ? reply.code(404).send({ error: "interview_not_found" })
        : reply.code(409).send({ error: outcome, message: pauseRefusals[outcome] });
    },
  );
}

type ResumeOrClosing = ResumeOutcome | StartRefusal;

/** The refusal of «Продолжить» in Russian. */
function refuseResume(reply: FastifyReply, outcome: Exclude<ResumeOrClosing, { type: "resumed" }>) {
  switch (outcome.type) {
    case "not_found": {
      return reply.code(404).send({ error: "interview_not_found" });
    }
    case "not_paused": {
      return reply.code(409).send({ error: outcome.type, message: "Мок не на паузе." });
    }
    case "invalid_agent":
    case "agent_unavailable": {
      return refuseAgent(reply, outcome, "мок");
    }
    case "target_archived": {
      return reply.code(409).send({
        error: outcome.type,
        message: "Цель в архиве. Верните её из архива, чтобы продолжить мок.",
      });
    }
    case "server_closing": {
      return reply.code(503).send({
        error: outcome.type,
        message: "Сервер завершает работу и не продолжает мок.",
      });
    }
    default: {
      return outcome satisfies never;
    }
  }
}

/** `POST /api/interviews/:id/resume` `{ agent? }`. */
function registerResume(server: FastifyInstance, dependencies: Dependencies) {
  server.post<{ Params: { id: string }; Body: unknown }>(
    "/api/interviews/:id/resume",
    { schema: { params } },
    async (request, reply) => {
      const resumeRequest = continuationRequestOf(request.body);
      if (resumeRequest === undefined) {
        return reply.code(400).send({ error: "invalid_request" });
      }
      const { id } = request.params;
      const outcome = await startForInterview(dependencies, id, {
        start: async () => dependencies.interviews.resume(id, resumeRequest),
        notFound: { type: "not_found" } as const,
      });
      return outcome.type === "resumed"
        ? reply.code(200).send(outcome.interview)
        : refuseResume(reply, outcome);
    },
  );
}

/**
 * The pause of Mock interviews (#84):
 * - `POST /api/interviews/:id/pause`: «Пауза»; the time stops and the agent stops at once. 204, or
 *   409 `not_running` or `finishing` with a Russian `message`.
 * - `POST /api/interviews/:id/resume` `{ agent? }`: «Продолжить» with the Mock interview's agent, or
 *   with the Target's agent when the Candidate chose it; 200 with the view, whose `sessionId` is the
 *   new AgentSession. 409 `agent_unavailable` gives `agent`, `reason` and `targetAgent`: the Target's
 *   agent the Candidate may go on with, or null. 409 `not_paused` or `target_archived`, 400
 *   `invalid_agent`, 503 `server_closing`; each with a Russian `message`.
 */
export function registerPauseRoutes(server: FastifyInstance, dependencies: Dependencies) {
  registerPause(server, dependencies);
  registerResume(server, dependencies);
}
