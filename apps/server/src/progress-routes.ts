import type { FastifyInstance } from "fastify";

import { grades } from "./composition.ts";
import type { Features, Grade } from "./composition.ts";
import { attemptParams, params, uuid } from "./route-params.ts";

type Dependencies = Pick<Features, "interviews" | "progress" | "targets">;

interface HistoryQuery {
  page: number;
  from?: string;
  to?: string;
  sectionId?: string;
}

const querystring = {
  type: "object",
  properties: {
    page: { type: "integer", minimum: 1, default: 1 },
    from: { type: "string", format: "date-time" },
    to: { type: "string", format: "date-time" },
    sectionId: uuid,
  },
  additionalProperties: false,
} as const;

/** The Dispute's new Grade and reason; body checks keep JSON types strict, without coercion. */
function disputeOf(body: unknown): { grade: Grade; reason: unknown } | undefined {
  if (typeof body !== "object" || body === null || Object.keys(body).length !== 2) {
    return undefined;
  }
  const given: unknown = Reflect.get(body, "grade");
  const grade = grades.find((known) => known === given);
  return grade === undefined ? undefined : { grade, reason: Reflect.get(body, "reason") };
}

function registerDispute(server: FastifyInstance, { interviews }: Dependencies) {
  server.post<{ Params: { id: string; attemptId: string }; Body: unknown }>(
    "/api/interviews/:id/attempts/:attemptId/dispute",
    { schema: { params: attemptParams } },
    async (request, reply) => {
      const dispute = disputeOf(request.body);
      if (dispute === undefined) {
        return reply
          .code(400)
          .send({ error: "invalid_grade", message: "Выберите оценку от 0 до 3." });
      }
      if (typeof dispute.reason !== "string" || dispute.reason.trim() === "") {
        return reply.code(400).send({ error: "empty_reason", message: "Напишите причину." });
      }
      const debrief = await interviews.dispute({
        ...request.params,
        grade: dispute.grade,
        reason: dispute.reason.trim(),
      });
      return debrief ?? reply.code(404).send({ error: "attempt_not_found" });
    },
  );
}

function registerHistory(server: FastifyInstance, { interviews, targets }: Dependencies) {
  server.get<{ Params: { id: string }; Querystring: HistoryQuery }>(
    "/api/targets/:id/interviews/history",
    { schema: { params, querystring } },
    async (request, reply) => {
      if ((await targets.get(request.params.id)) === undefined) {
        return reply.code(404).send({ error: "target_not_found" });
      }
      const { page, ...filter } = request.query;
      return interviews.history({ targetId: request.params.id, page, filter });
    },
  );
}

/**
 * Progress, Disputes and the session history:
 * - `GET /api/targets/:id/progress`: the Topic status of each Topic of the plan, the Readiness
 *   counts over the enabled Sections and the Topics «подтянуть в первую очередь». The running Mock
 *   interview's Attempts count only once it ends.
 * - `GET /api/interviews/:id/summary`: the summary Debrief of a Mock interview: the agent's summary
 *   and next step, null without them, the answered and unanswered questions and the Topic status
 *   changes.
 * - `POST /api/interviews/:id/attempts/:attemptId/dispute` `{ grade, reason }`: the Candidate's
 *   correction of the Grade; the latest one applies. The Debrief with the Dispute, 400 with a
 *   Russian `message`, or 404.
 * - `GET /api/targets/:id/interviews/history?page&from&to&sectionId`: the session history, 20 Mock
 *   interviews a page from page 1, the newest first, with `total`. `from` (inclusive) and `to`
 *   (exclusive) bound the start time; `sectionId` keeps the Mock interviews that trained the
 *   Section. Each item has the date, the Sections and the average Grade after Disputes, which stays
 *   null while the Mock interview runs.
 */
export function registerProgressRoutes(server: FastifyInstance, dependencies: Dependencies) {
  const { interviews, progress } = dependencies;
  server.get<{ Params: { id: string } }>(
    "/api/targets/:id/progress",
    { schema: { params } },
    async (request, reply) =>
      (await progress.target(request.params.id)) ??
      reply.code(404).send({ error: "target_not_found" }),
  );
  server.get<{ Params: { id: string } }>(
    "/api/interviews/:id/summary",
    { schema: { params } },
    async (request, reply) => {
      const found = await interviews.summary(request.params.id);
      if (found === undefined) {
        return reply.code(404).send({ error: "interview_not_found" });
      }
      const { targetId, ...summary } = found;
      const topicChanges = await progress.interviewChanges(targetId, request.params.id);
      return { ...summary, topicChanges };
    },
  );
  registerDispute(server, dependencies);
  registerHistory(server, dependencies);
}
