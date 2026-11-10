// The HTTP API of Side threads (#80). The chat of a Side thread goes through its AgentSession,
// `sessionId` of the Side thread, on `/api/sessions/:id/events`, as the interviewer chat does:
// the Candidate's messages, «Остановить» and the agent's reply in chunks.
import type { FastifyInstance, FastifyReply } from "fastify";

import type { ArchiveGuard } from "./archive-guard.ts";
import type { ContinueOutcome, Features, SideThreadOutcome } from "./composition.ts";
import { sideThreadRequestOf } from "./interview-requests.ts";
import {
  continuationRequestOf,
  refuseAgent,
  startForInterview,
} from "./interview-session-start.ts";
import type { StartRefusal } from "./interview-session-start.ts";
import { params, uuid } from "./route-params.ts";

type Dependencies = Pick<Features, "interviews"> & { readonly archiveGuard: ArchiveGuard };

/** `:id` of a Mock interview and `:threadId` of its Side thread. */
const threadParams = {
  type: "object",
  properties: { id: uuid, threadId: uuid },
  required: ["id", "threadId"],
} as const;

type OpenOrClosing = SideThreadOutcome | StartRefusal;

/** The refusal of an opening in Russian. */
function refuseOpening(reply: FastifyReply, outcome: Exclude<OpenOrClosing, { type: "opened" }>) {
  switch (outcome.type) {
    case "server_closing": {
      return reply.code(503).send({
        error: outcome.type,
        message: "Сервер завершает работу и не открывает новые ветки.",
      });
    }
    case "message_before_question": {
      return reply.code(409).send({
        error: outcome.type,
        message: "Это сообщение пришло до первого вопроса, поэтому ветку у него открыть нельзя.",
      });
    }
    case "target_archived": {
      return reply.code(409).send({
        error: outcome.type,
        message: "Цель в архиве. Верните её из архива, чтобы открыть ветку.",
      });
    }
    case "interview_not_found":
    case "question_not_found":
    case "message_not_found":
    case "attempt_not_found": {
      return reply.code(404).send({ error: outcome.type });
    }
    case "agent_unavailable": {
      return reply.code(400).send({
        error: outcome.type,
        message:
          outcome.reason === null
            ? "Агент мока недоступен, поэтому ветку открыть нельзя."
            : `Агент мока недоступен. ${outcome.reason}`,
      });
    }
    default: {
      return outcome satisfies never;
    }
  }
}

type ContinueOrClosing = ContinueOutcome | StartRefusal;

/** The refusal of «Продолжить» in Russian. */
function refuseContinuation(
  reply: FastifyReply,
  outcome: Exclude<ContinueOrClosing, { type: "continued" }>,
) {
  switch (outcome.type) {
    case "not_found": {
      return reply.code(404).send({ error: "side_thread_not_found" });
    }
    case "running": {
      return reply.code(409).send({
        error: "side_thread_running",
        message: "Агент ветки ещё работает: пишите в ветку как обычно.",
      });
    }
    case "target_archived": {
      return reply.code(409).send({
        error: outcome.type,
        message: "Цель в архиве. Верните её из архива, чтобы продолжить ветку.",
      });
    }
    case "server_closing": {
      return reply.code(503).send({
        error: outcome.type,
        message: "Сервер завершает работу и не продолжает ветки.",
      });
    }
    case "closed": {
      return reply.code(409).send({
        error: "side_thread_closed",
        message: "Ветка закрыта: её можно только читать. Откройте новую ветку.",
      });
    }
    case "invalid_agent":
    case "agent_unavailable": {
      return refuseAgent(reply, outcome, "ветку");
    }
    default: {
      return outcome satisfies never;
    }
  }
}

/** `POST /api/interviews/:id/side-threads/:threadId/continue` `{ agent? }`; see registerSideThreadRoutes. */
function registerContinuation(server: FastifyInstance, dependencies: Dependencies) {
  const { interviews } = dependencies;
  server.post<{ Params: { id: string; threadId: string }; Body: unknown }>(
    "/api/interviews/:id/side-threads/:threadId/continue",
    { schema: { params: threadParams } },
    async (request, reply) => {
      const continuation = continuationRequestOf(request.body);
      if (continuation === undefined) {
        return reply.code(400).send({ error: "invalid_request" });
      }
      const { id, threadId } = request.params;
      const outcome = await startForInterview(dependencies, id, {
        start: async () => interviews.continueSideThread(id, threadId, continuation),
        notFound: { type: "not_found" } as const,
      });
      return outcome.type === "continued"
        ? reply.code(200).send(outcome.thread)
        : refuseContinuation(reply, outcome);
    },
  );
}

/**
 * - `POST /api/interviews/:id/side-threads` `{ origin: { kind, id }, fragment?, question? }`:
 *   «Обсудить отдельно» with the selected fragment and the Candidate's question. The origin is a
 *   card (`question`, the asked question's id), an interviewer message (`message`, its chat entry
 *   id) or a Debrief (`debrief`, the Attempt's id). 201 with the Side thread; 400
 *   `invalid_request` or `agent_unavailable`, 404 `interview_not_found`, `question_not_found`,
 *   `message_not_found` or `attempt_not_found`, 409 `message_before_question` or `target_archived`,
 *   503 `server_closing`.
 * - `GET /api/interviews/:id/side-threads`: the Side threads in the order they were opened; the
 *   view of the Mock interview holds them too.
 * - `POST /api/interviews/:id/side-threads/:threadId/continue` `{ agent? }`: «Продолжить» in a Side
 *   thread whose agent is gone after a restart or a crash (#85): a new session of the thread
 *   continues its chat, with the Mock interview's agent or the Target's agent the Candidate chose.
 *   200 with the Side thread and its new `sessionId`. 409 `agent_unavailable` gives `agent`,
 *   `reason` and `targetAgent`, as «Продолжить» of a Mock interview. 400 `invalid_request` or
 *   `invalid_agent`, 404 `side_thread_not_found`, 409 `side_thread_running`, `side_thread_closed`
 *   or `target_archived`, 503 `server_closing`.
 * - `DELETE /api/interviews/:id/side-threads/:threadId`: ✕ deletes the Side thread with every
 *   AgentSession of its chat and their journals for good; the hint mark stays. 204, or 404
 *   `side_thread_not_found`.
 */
export function registerSideThreadRoutes(server: FastifyInstance, dependencies: Dependencies) {
  const { interviews } = dependencies;
  server.get<{ Params: { id: string } }>(
    "/api/interviews/:id/side-threads",
    { schema: { params } },
    async (request, reply) =>
      (await interviews.sideThreads(request.params.id)) ??
      reply.code(404).send({ error: "interview_not_found" }),
  );
  server.post<{ Params: { id: string }; Body: unknown }>(
    "/api/interviews/:id/side-threads",
    { schema: { params } },
    async (request, reply) => {
      const opening = sideThreadRequestOf(request.body);
      if (opening === undefined) {
        return reply.code(400).send({ error: "invalid_request" });
      }
      const { id } = request.params;
      const outcome = await startForInterview(dependencies, id, {
        start: async () => interviews.openSideThread(id, opening),
        notFound: { type: "interview_not_found" } as const,
      });
      return outcome.type === "opened"
        ? reply.code(201).send(outcome.thread)
        : refuseOpening(reply, outcome);
    },
  );
  registerContinuation(server, dependencies);
  server.delete<{ Params: { id: string; threadId: string } }>(
    "/api/interviews/:id/side-threads/:threadId",
    { schema: { params: threadParams } },
    async (request, reply) => {
      const outcome = await interviews.deleteSideThread(request.params.id, request.params.threadId);
      return outcome === "deleted"
        ? reply.code(204).send()
        : reply.code(404).send({ error: "side_thread_not_found" });
    },
  );
}
