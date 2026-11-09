// The HTTP API of Side threads (#80). The chat of a Side thread goes through its AgentSession,
// `sessionId` of the Side thread, on `/api/sessions/:id/events`, as the interviewer chat does:
// the Candidate's messages, «Остановить» and the agent's reply in chunks.
import type { FastifyInstance, FastifyReply } from "fastify";

import { SessionsClosedError } from "./composition.ts";
import type { Features, SideThreadOutcome, SideThreadRequest } from "./composition.ts";
import { params } from "./route-params.ts";

type Dependencies = Pick<Features, "interviews">;

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const originKeys = new Set(["kind", "id"]);
const requestKeys = new Set(["origin", "question"]);

function isPlainObject(value: unknown): value is object {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** The origin `{ kind: "question", id }` of a card's asked question; undefined when invalid. */
function originOf(origin: unknown): SideThreadRequest["origin"] | undefined {
  if (!isPlainObject(origin) || Object.keys(origin).some((key) => !originKeys.has(key))) {
    return undefined;
  }
  const id: unknown = Reflect.get(origin, "id");
  return Reflect.get(origin, "kind") === "question" &&
    typeof id === "string" &&
    uuidPattern.test(id)
    ? { kind: "question", id }
    : undefined;
}

/** The opening of the body `{ origin, question? }`; undefined when invalid. */
function sideThreadRequestOf(body: unknown): SideThreadRequest | undefined {
  if (!isPlainObject(body) || Object.keys(body).some((key) => !requestKeys.has(key))) {
    return undefined;
  }
  const origin = originOf(Reflect.get(body, "origin"));
  const question: unknown = Reflect.get(body, "question");
  if (origin === undefined || (question !== undefined && typeof question !== "string")) {
    return undefined;
  }
  const text = question?.trim() ?? "";
  return { origin, question: text === "" ? null : text };
}

type OpenOrClosing = SideThreadOutcome | { readonly type: "server_closing" };

async function openOrClosing(
  interviews: Features["interviews"],
  { id, request }: { id: string; request: SideThreadRequest },
): Promise<OpenOrClosing> {
  try {
    return await interviews.openSideThread(id, request);
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
    case "interview_not_found":
    case "question_not_found": {
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

/**
 * - `POST /api/interviews/:id/side-threads` `{ origin: { kind: "question", id }, question? }`:
 *   «Обсудить отдельно» at the card of the asked question `id`, with the Candidate's question.
 *   201 with the Side thread; 400 `invalid_request` or `agent_unavailable`, 404, 503
 *   `server_closing`.
 * - `GET /api/interviews/:id/side-threads`: the Side threads in the order they were opened; the
 *   view of the Mock interview holds them too.
 */
export function registerSideThreadRoutes(server: FastifyInstance, { interviews }: Dependencies) {
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
      const outcome = await openOrClosing(interviews, { id: request.params.id, request: opening });
      return outcome.type === "opened"
        ? reply.code(201).send(outcome.thread)
        : refuseOpening(reply, outcome);
    },
  );
}
