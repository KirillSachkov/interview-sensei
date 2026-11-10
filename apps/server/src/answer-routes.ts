import type { FastifyInstance, FastifyReply } from "fastify";

import type { ArchiveGuard } from "./archive-guard.ts";
import { registerInboxRoutes } from "./inbox-routes.ts";
import type { AnswerStartOutcome, Features } from "./composition.ts";
import { params, uuid } from "./route-params.ts";

type Dependencies = Pick<Features, "answers"> & { readonly archiveGuard: ArchiveGuard };

/** The most Questions one answer search may fill: each one costs about one web search. */
const maxCount = 200;

/** The refusal of a start in Russian, with what the Candidate can do. */
function refuseStart(
  reply: FastifyReply,
  outcome: Exclude<AnswerStartOutcome, { type: "started" }> | { type: "target_archived" },
) {
  switch (outcome.type) {
    case "target_not_found": {
      return reply.code(404).send({ error: outcome.type });
    }
    case "target_archived": {
      return reply.code(409).send({
        error: outcome.type,
        message: "Цель в архиве. Верните её из архива, чтобы наполнить ответы.",
      });
    }
    case "nothing_to_fill": {
      return reply.code(400).send({
        error: outcome.type,
        message: "У всех вопросов цели уже есть опорный ответ.",
      });
    }
    case "search_running": {
      return reply.code(409).send({
        error: outcome.type,
        message:
          "По этой цели уже идёт наполнение ответов. Дождитесь его конца или остановите его.",
      });
    }
    case "agent_unavailable": {
      return reply.code(400).send({
        error: outcome.type,
        message:
          outcome.reason === null
            ? "Нет доступного агента. Выберите агента в меню «Агент» в верхней панели."
            : `Агент цели недоступен. ${outcome.reason} Или выберите другого агента в меню «Агент» в верхней панели.`,
      });
    }
    default: {
      return outcome satisfies never;
    }
  }
}

function registerStart(server: FastifyInstance, { answers, archiveGuard }: Dependencies) {
  server.post<{ Params: { id: string }; Body: { count: number } }>(
    "/api/targets/:id/answers/search",
    {
      schema: {
        params,
        body: {
          type: "object",
          properties: { count: { type: "integer", minimum: 1, maximum: maxCount } },
          required: ["count"],
          additionalProperties: false,
        },
      },
    },
    async (request, reply) => {
      const targetId = request.params.id;
      const { count } = request.body;
      const outcome = await archiveGuard.startSession(targetId, async () =>
        answers.start({ targetId, count }),
      );
      if (outcome === "target_archived") {
        return refuseStart(reply, { type: outcome });
      }
      return outcome.type === "started"
        ? reply.code(202).send(outcome.run)
        : refuseStart(reply, outcome);
    },
  );
}

function registerStop(server: FastifyInstance, { answers }: Dependencies) {
  server.post<{ Params: { id: string } }>(
    "/api/targets/:id/answers/search/stop",
    { schema: { params } },
    async (request, reply) => {
      const outcome = await answers.stop(request.params.id);
      switch (outcome.type) {
        case "stopped": {
          return { reportId: outcome.report.id };
        }
        case "target_not_found": {
          return reply.code(404).send({ error: outcome.type });
        }
        case "not_running": {
          return reply.code(409).send({
            error: outcome.type,
            message: "Наполнение ответов уже закончилось. Обновите страницу.",
          });
        }
        default: {
          return outcome satisfies never;
        }
      }
    },
  );
}

const reportParams = {
  type: "object",
  properties: { id: uuid, reportId: uuid },
  required: ["id", "reportId"],
} as const;

function registerReads(server: FastifyInstance, { answers }: Dependencies) {
  server.get<{ Params: { id: string } }>(
    "/api/targets/:id/answers",
    { schema: { params } },
    async (request, reply) => {
      const state = await answers.state(request.params.id);
      return state ?? reply.code(404).send({ error: "target_not_found" });
    },
  );
  server.get<{ Params: { id: string; reportId: string } }>(
    "/api/targets/:id/answer-reports/:reportId",
    { schema: { params: reportParams } },
    async (request, reply) => {
      const report = await answers.report(request.params.id, request.params.reportId);
      return report ?? reply.code(404).send({ error: "report_not_found" });
    },
  );
}

/**
 * Answer search of a Target (spec #70):
 * - `GET /api/targets/:id/answers`: `withoutAnswer`, the visible Questions without a reference
 *   answer; `queued`, the Questions the queue holds; the run that waits or runs with `filled` of
 *   `total`; the latest report.
 * - `POST /api/targets/:id/answers/search` `{ count }`: «Найти ответы» for up to `count` Questions;
 *   202 with the run, `waiting` while the Target's Inbox processing runs. 409 `search_running`, 400
 *   `nothing_to_fill` or `agent_unavailable` with a Russian `message`.
 * - `POST /api/targets/:id/answers/search/stop`: «Остановить»; the server closes the search with a
 *   partial report and stops its agent; 200 `{ reportId }`, 409 `not_running`.
 * - `GET /api/targets/:id/answer-reports/:reportId`: the report with the counts by origin, the
 *   filled and failed Questions and the token usage, null when the agent sent none.
 */
function registerAnswerRoutes(server: FastifyInstance, dependencies: Dependencies) {
  registerStart(server, dependencies);
  registerStop(server, dependencies);
  registerReads(server, dependencies);
}

/** The routes of the agent's background work on a Target: Inbox processing and answer search. */
export function registerBackgroundRoutes(
  server: FastifyInstance,
  dependencies: Dependencies & Parameters<typeof registerInboxRoutes>[1],
) {
  registerInboxRoutes(server, dependencies);
  registerAnswerRoutes(server, dependencies);
}
