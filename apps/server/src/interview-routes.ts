import type { FastifyInstance, FastifyReply } from "fastify";
import type { WebSocket } from "ws";

import { SessionsClosedError } from "./composition.ts";
import type { Features, InterviewView, StartRequest } from "./composition.ts";
import { onlyField, replyOf, startRequestOf } from "./interview-requests.ts";

type Dependencies = Pick<Features, "interviews" | "targets">;

const uuid = { type: "string", format: "uuid" } as const;
const params = { type: "object", properties: { id: uuid }, required: ["id"] } as const;
const attemptParams = {
  type: "object",
  properties: { id: uuid, attemptId: uuid },
  required: ["id", "attemptId"],
} as const;

const otherAgentHint = "Или выберите другого агента в меню «Агент» в верхней панели.";

type StartOutcome =
  Awaited<ReturnType<Features["interviews"]["start"]>> | { readonly type: "server_closing" };

/** The start's outcome; `server_closing` once the server shuts down and starts no agent. */
async function startOrClosing(
  interviews: Features["interviews"],
  request: StartRequest,
): Promise<StartOutcome> {
  try {
    return await interviews.start(request);
  } catch (error) {
    if (error instanceof SessionsClosedError) {
      return { type: "server_closing" };
    }
    throw error;
  }
}

/** The refusal of a start in Russian, with what the Candidate can do. */
function refuseStart(reply: FastifyReply, outcome: Exclude<StartOutcome, { type: "started" }>) {
  switch (outcome.type) {
    case "server_closing": {
      return reply.code(503).send({
        error: outcome.type,
        message: "Сервер завершает работу и не начинает новый мок.",
      });
    }
    case "target_not_found": {
      return reply.code(404).send({ error: outcome.type });
    }
    case "invalid_sections": {
      return reply.code(400).send({
        error: outcome.type,
        message: "Выберите хотя бы одну включённую секцию плана.",
      });
    }
    case "agent_unavailable": {
      return reply.code(400).send({
        error: outcome.type,
        message:
          outcome.reason === null
            ? "Нет доступного агента. Выберите агента в меню «Агент» в верхней панели."
            : `Агент цели недоступен. ${outcome.reason} ${otherAgentHint}`,
      });
    }
    case "interview_running": {
      return reply.code(409).send({
        error: outcome.type,
        message: "По этой цели уже идёт мок. Завершите его, чтобы начать новый.",
      });
    }
    default: {
      return outcome satisfies never;
    }
  }
}

function registerStart(server: FastifyInstance, { interviews }: Dependencies) {
  server.post<{ Params: { id: string }; Body: unknown }>(
    "/api/targets/:id/interviews",
    { schema: { params } },
    async (request, reply) => {
      const start = startRequestOf(request.params.id, request.body);
      if (start === undefined) {
        return reply.code(400).send({ error: "invalid_request" });
      }
      const outcome = await startOrClosing(interviews, start);
      return outcome.type === "started"
        ? reply.code(201).send(outcome.interview)
        : refuseStart(reply, outcome);
    },
  );
}

const answerRefusals = {
  not_running: "Мок уже завершён.",
  no_question: "Интервьюер ещё не показал вопрос.",
  already_answered: "Ответ на этот вопрос уже записан.",
  not_open: "Этот вопрос — квиз: ответ на него — выбор вариантов.",
  not_quiz: "На этот вопрос отвечают текстом.",
} as const;

const followUpRefusals = {
  not_running: answerRefusals.not_running,
  no_follow_up: "Интервьюер не задал уточняющий вопрос.",
} as const;

const invalidOptions = {
  error: "invalid_options",
  message: "Выберите один или несколько вариантов ответа.",
} as const;

/** The reply to an answer the Mock interview did not take. */
function refuseAnswer(
  reply: FastifyReply,
  outcome: Exclude<Awaited<ReturnType<Features["interviews"]["answer"]>>, "accepted">,
) {
  if (outcome === "not_found") {
    return reply.code(404).send({ error: "interview_not_found" });
  }
  return outcome === "invalid_options"
    ? reply.code(400).send(invalidOptions)
    : reply.code(409).send({ error: outcome, message: answerRefusals[outcome] });
}

/** `POST /api/interviews/:id/answer`: the Candidate's answer to the presented question. */
function registerAnswer(server: FastifyInstance, { interviews }: Dependencies) {
  server.post<{ Params: { id: string }; Body: unknown }>(
    "/api/interviews/:id/answer",
    { schema: { params } },
    async (request, reply) => {
      const answer = replyOf(request.body);
      if (answer === undefined || answer === "empty_answer") {
        return reply.code(400).send({ error: "empty_answer", message: "Напишите ответ." });
      }
      if (answer === "invalid_options") {
        return reply.code(400).send(invalidOptions);
      }
      const outcome = await interviews.answer(request.params.id, answer);
      return outcome === "accepted" ? reply.code(204).send() : refuseAnswer(reply, outcome);
    },
  );
}

function registerCandidateActions(server: FastifyInstance, dependencies: Dependencies) {
  const { interviews } = dependencies;
  registerAnswer(server, dependencies);
  server.post<{ Params: { id: string }; Body: unknown }>(
    "/api/interviews/:id/follow-up",
    { schema: { params } },
    async (request, reply) => {
      const text = onlyField(request.body, "text");
      if (typeof text !== "string" || text.trim() === "") {
        return reply.code(400).send({ error: "empty_answer", message: "Напишите ответ." });
      }
      const outcome = await interviews.answerFollowUp(request.params.id, { text });
      if (outcome === "accepted") {
        return reply.code(204).send();
      }
      return outcome === "not_found"
        ? reply.code(404).send({ error: "interview_not_found" })
        : reply.code(409).send({ error: outcome, message: followUpRefusals[outcome] });
    },
  );
  server.post<{ Params: { id: string } }>(
    "/api/interviews/:id/finish",
    { schema: { params } },
    async (request, reply) => {
      const outcome = await interviews.finish(request.params.id);
      if (outcome === "accepted") {
        return reply.code(202).send();
      }
      return outcome === "not_found"
        ? reply.code(404).send({ error: "interview_not_found" })
        : reply.code(409).send({ error: outcome, message: answerRefusals.not_running });
    },
  );
}

function send(socket: WebSocket, interview: InterviewView): void {
  socket.send(JSON.stringify({ type: "interview", interview }));
}

/** Serves one browser connection to a Mock interview: the view at once and after each change. */
async function serveEvents(socket: WebSocket, id: string, { interviews }: Dependencies) {
  const unsubscribe = interviews.subscribe(id, (interview) => {
    send(socket, interview);
  });
  socket.on("close", unsubscribe);
  const interview = await interviews.view(id);
  if (interview === undefined) {
    socket.close(4404, "interview_not_found");
  } else {
    send(socket, interview);
  }
}

function registerReads(server: FastifyInstance, dependencies: Dependencies) {
  const { interviews, targets } = dependencies;
  server.get<{ Params: { id: string } }>(
    "/api/targets/:id/interviews",
    { schema: { params } },
    async (request, reply) =>
      (await targets.get(request.params.id)) === undefined
        ? reply.code(404).send({ error: "target_not_found" })
        : interviews.latest(request.params.id),
  );
  server.get<{ Params: { id: string } }>(
    "/api/interviews/:id",
    { schema: { params } },
    async (request, reply) =>
      (await interviews.view(request.params.id)) ??
      reply.code(404).send({ error: "interview_not_found" }),
  );
  server.get<{ Params: { id: string; attemptId: string } }>(
    "/api/interviews/:id/attempts/:attemptId",
    { schema: { params: attemptParams } },
    async (request, reply) =>
      (await interviews.attempt(request.params.id, request.params.attemptId)) ??
      reply.code(404).send({ error: "attempt_not_found" }),
  );
  server.get<{ Params: { id: string } }>(
    "/api/interviews/:id/events",
    { websocket: true, schema: { params } },
    async (socket, request) => serveEvents(socket, request.params.id, dependencies),
  );
}

/**
 * The HTTP and WebSocket API of Mock interviews. The interviewer chat goes through the AgentSession
 * of the Mock interview, `sessionId` of its view, on `/api/sessions/:id/events`.
 * - `POST /api/targets/:id/interviews` `{ sectionIds, limitMinutes?, difficulty? }`: starts a Mock
 *   interview with the Target's agent; the limit is null, 30 or 60, the difficulty `easier`,
 *   `as_is` or `harder`, by default the one of the Target's last Mock interview. 400 `invalid_sections` or `agent_unavailable`, 409 `interview_running`, 503
 *   `server_closing`, each with a Russian `message`.
 * - `GET /api/targets/:id/interviews`: the Target's five newest Mock interviews, the newest first.
 * - `GET /api/interviews/:id`: the view. It never holds a Grade.
 * - `POST /api/interviews/:id/answer` `{ text }`, `{ optionIds }` or `{ skipped: true }` for
 *   «Не знаю»: the Candidate's answer to the presented question; 204, or 400 or 409 with the reason
 *   and a Russian `message`.
 * - `POST /api/interviews/:id/follow-up` `{ text }`: the answer to the agent's last Follow-up.
 * - `POST /api/interviews/:id/finish`: «Завершить»; 202, then the agent writes its summary.
 * - `GET /api/interviews/:id/attempts/:attemptId`: the Debrief of an Attempt with its Grade.
 * - WebSocket `/api/interviews/:id/events`: `{ type: "interview", interview }` at once and after
 *   each change: a question shown, an answer or Attempt recorded, the Mock interview finished.
 */
export function registerInterviewRoutes(server: FastifyInstance, dependencies: Dependencies) {
  registerStart(server, dependencies);
  registerCandidateActions(server, dependencies);
  registerReads(server, dependencies);
}
