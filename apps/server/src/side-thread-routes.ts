// The HTTP API of Side threads (#80). The chat of a Side thread goes through its AgentSession,
// `sessionId` of the Side thread, on `/api/sessions/:id/events`, as the interviewer chat does:
// the Candidate's messages, «Остановить» and the agent's reply in chunks.
import type { FastifyInstance, FastifyReply } from "fastify";

import type { ArchiveGuard } from "./archive-guard.ts";
import { SessionsClosedError } from "./composition.ts";
import type {
  ContinueOutcome,
  Features,
  SideThreadOutcome,
  SideThreadRequest,
} from "./composition.ts";
import { sideThreadRequestOf } from "./interview-requests.ts";
import { params, uuid } from "./route-params.ts";

type Dependencies = Pick<Features, "interviews"> & { readonly archiveGuard: ArchiveGuard };

/** `:id` of a Mock interview and `:threadId` of its Side thread. */
const threadParams = {
  type: "object",
  properties: { id: uuid, threadId: uuid },
  required: ["id", "threadId"],
} as const;

type OpenOrClosing =
  SideThreadOutcome | { readonly type: "server_closing" } | { readonly type: "target_archived" };

/**
 * Opens the Side thread as a new agent session of the Mock interview's Target: an archived Target
 * refuses it, as it refuses its setup session and a Mock interview.
 */
async function openOrClosing(
  { interviews, archiveGuard }: Dependencies,
  { id, request }: { id: string; request: SideThreadRequest },
): Promise<OpenOrClosing> {
  const interview = await interviews.view(id);
  if (interview === undefined) {
    return { type: "interview_not_found" };
  }
  try {
    const outcome = await archiveGuard.startSession(interview.targetId, async () =>
      interviews.openSideThread(id, request),
    );
    return outcome === "target_archived" ? { type: outcome } : outcome;
  } catch (error) {
    if (error instanceof SessionsClosedError) {
      return { type: "server_closing" };
    }
    throw error;
  }
}

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

type ContinueOrClosing =
  ContinueOutcome | { readonly type: "server_closing" } | { readonly type: "target_archived" };

/** «Продолжить» in the Side thread as a new agent session of the Target, as an opening. */
async function continueOrClosing(
  { interviews, archiveGuard }: Dependencies,
  { id, threadId }: { id: string; threadId: string },
): Promise<ContinueOrClosing> {
  const interview = await interviews.view(id);
  if (interview === undefined) {
    return { type: "not_found" };
  }
  try {
    const outcome = await archiveGuard.startSession(interview.targetId, async () =>
      interviews.continueSideThread(id, threadId),
    );
    return outcome === "target_archived" ? { type: outcome } : outcome;
  } catch (error) {
    if (error instanceof SessionsClosedError) {
      return { type: "server_closing" };
    }
    throw error;
  }
}

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
    case "agent_unavailable": {
      return reply.code(400).send({
        error: outcome.type,
        message:
          outcome.reason === null
            ? "Агент мока недоступен, поэтому ветку продолжить нельзя."
            : `Агент мока недоступен. ${outcome.reason}`,
      });
    }
    default: {
      return outcome satisfies never;
    }
  }
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
 * - `POST /api/interviews/:id/side-threads/:threadId/continue`: «Продолжить» in a Side thread
 *   whose agent is gone (#85): a new session of the thread continues its chat. 200 with the Side
 *   thread and its new `sessionId`; 400 `agent_unavailable`, 404 `side_thread_not_found`, 409
 *   `side_thread_running` or `target_archived`, 503 `server_closing`.
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
      const outcome = await openOrClosing(dependencies, {
        id: request.params.id,
        request: opening,
      });
      return outcome.type === "opened"
        ? reply.code(201).send(outcome.thread)
        : refuseOpening(reply, outcome);
    },
  );
  server.post<{ Params: { id: string; threadId: string } }>(
    "/api/interviews/:id/side-threads/:threadId/continue",
    { schema: { params: threadParams } },
    async (request, reply) => {
      const outcome = await continueOrClosing(dependencies, request.params);
      return outcome.type === "continued"
        ? reply.code(200).send(outcome.thread)
        : refuseContinuation(reply, outcome);
    },
  );
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
