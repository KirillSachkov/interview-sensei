import type { FastifyInstance, FastifyReply } from "fastify";

import type { ArchiveGuard } from "./archive-guard.ts";
import type { Features, InboxStartOutcome } from "./composition.ts";
import { params, uuid } from "./route-params.ts";

type Dependencies = Pick<Features, "sources"> & { readonly archiveGuard: ArchiveGuard };

const otherAgentHint = "Или выберите другого агента в меню «Агент» в верхней панели.";

/** The refusals of a start that the Candidate fixes in the list. */
const badRequests = {
  no_sources: "Нет материалов, которые ждут разбора.",
  no_questions: "В базе нет вопросов, которые можно перепроверить.",
  invalid_sources: "Часть выбранных материалов уже разобрана или удалена. Обновите список.",
} as const;

/** The refusal of a start in Russian, with what the Candidate can do. */
function refuseStart(
  reply: FastifyReply,
  outcome: Exclude<InboxStartOutcome, { type: "started" }> | { type: "target_archived" },
) {
  switch (outcome.type) {
    case "target_not_found": {
      return reply.code(404).send({ error: outcome.type });
    }
    case "target_archived": {
      return reply.code(409).send({
        error: outcome.type,
        message: "Цель в архиве. Верните её из архива, чтобы разобрать материалы.",
      });
    }
    case "no_sources":
    case "no_questions":
    case "invalid_sources": {
      return reply.code(400).send({ error: outcome.type, message: badRequests[outcome.type] });
    }
    case "processing_running": {
      return reply.code(409).send({
        error: outcome.type,
        message:
          "По этой цели уже идёт разбор или перепроверка. Новый запуск подождёт, пока он закончится.",
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
    default: {
      return outcome satisfies never;
    }
  }
}

function registerStart(server: FastifyInstance, { sources, archiveGuard }: Dependencies) {
  server.post<{ Params: { id: string }; Body: { sourceIds?: string[] } | undefined }>(
    "/api/targets/:id/inbox/processing",
    {
      schema: {
        params,
        body: {
          type: "object",
          properties: { sourceIds: { type: "array", items: uuid, maxItems: 500 } },
          additionalProperties: false,
          nullable: true,
        },
      },
    },
    async (request, reply) => {
      const targetId = request.params.id;
      const sourceIds = request.body?.sourceIds;
      const outcome = await archiveGuard.startSession(targetId, async () =>
        sources.inbox.start({ targetId, sourceIds }),
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

/** «Запустить перепроверку»: the recheck of the Target's bank; refusals as for a processing. */
function registerRecheck(server: FastifyInstance, { sources, archiveGuard }: Dependencies) {
  server.post<{ Params: { id: string } }>(
    "/api/targets/:id/inbox/recheck",
    { schema: { params } },
    async (request, reply) => {
      const targetId = request.params.id;
      const outcome = await archiveGuard.startSession(targetId, async () =>
        sources.inbox.startRecheck(targetId),
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

const reportParams = {
  type: "object",
  properties: { id: uuid, reportId: uuid },
  required: ["id", "reportId"],
} as const;

function registerReads(server: FastifyInstance, { sources }: Dependencies) {
  server.get<{ Params: { id: string } }>(
    "/api/targets/:id/inbox-reports",
    { schema: { params } },
    async (request, reply) => {
      const reports = await sources.inbox.reports(request.params.id);
      return reports ?? reply.code(404).send({ error: "target_not_found" });
    },
  );
  server.get<{ Params: { id: string } }>(
    "/api/targets/:id/inbox",
    { schema: { params } },
    async (request, reply) => {
      const state = await sources.inbox.state(request.params.id);
      return state ?? reply.code(404).send({ error: "target_not_found" });
    },
  );
  server.get<{
    Params: { id: string; reportId: string };
    Querystring: { new?: boolean };
  }>(
    "/api/targets/:id/inbox-reports/:reportId",
    {
      schema: {
        params: reportParams,
        querystring: {
          type: "object",
          properties: { new: { type: "boolean" } },
          additionalProperties: false,
        },
      },
    },
    async (request, reply) => {
      const report = await sources.inbox.report(request.params.id, request.params.reportId, {
        onlyNew: request.query.new === true,
      });
      return report ?? reply.code(404).send({ error: "report_not_found" });
    },
  );
  server.post<{ Params: { id: string; reportId: string } }>(
    "/api/targets/:id/inbox-reports/:reportId/seen",
    { schema: { params: reportParams } },
    async (request, reply) => {
      const found = await sources.inbox.markSeen(request.params.id, request.params.reportId);
      return found ? reply.code(204).send() : reply.code(404).send({ error: "report_not_found" });
    },
  );
}

/**
 * Inbox processing of a Target (spec #47):
 * - `GET /api/targets/:id/inbox`: the open proposal of the setup chat with its materials, the
 *   running processing, the latest Inbox report and `unprocessed`, the materials in the Inbox.
 * - `POST /api/targets/:id/inbox/processing` `{ sourceIds? }`: «Запустить разбор» of the chosen
 *   materials, of every material in the Inbox without `sourceIds`; 202 with the run. 409
 *   `processing_running` while a processing runs, 400 `no_sources`, `invalid_sources` or
 *   `agent_unavailable` with a Russian `message`.
 * - `POST /api/targets/:id/inbox/proposal/dismiss`: «Не сейчас»; the materials stay in the Inbox.
 * - `POST /api/targets/:id/inbox/recheck`: «Запустить перепроверку» of the Target's bank; 202 with
 *   the run, refusals as above, 400 `no_questions` without visible Questions.
 * - `POST /api/targets/:id/inbox/recheck-proposal/dismiss`: «Не сейчас» on the recheck's card.
 * - `GET /api/targets/:id/inbox-reports`: the history of the Target's reports, the newest first.
 * - `GET /api/targets/:id/inbox-reports/:reportId`: the Inbox report with the added Questions by
 *   Section and Topic, and the list «скрыть?» of a recheck; `new=true` keeps the Questions the
 *   Candidate has not seen.
 * - `POST /api/targets/:id/inbox-reports/:reportId/seen`: «просмотрено» of the report's Questions.
 */
export function registerInboxRoutes(server: FastifyInstance, dependencies: Dependencies) {
  registerStart(server, dependencies);
  registerRecheck(server, dependencies);
  registerReads(server, dependencies);
  for (const [path, mode] of [
    ["proposal", "processing"],
    ["recheck-proposal", "recheck"],
  ] as const) {
    server.post<{ Params: { id: string } }>(
      `/api/targets/:id/inbox/${path}/dismiss`,
      { schema: { params } },
      async (request, reply) => {
        if ((await dependencies.sources.list(request.params.id)) === undefined) {
          return reply.code(404).send({ error: "target_not_found" });
        }
        await dependencies.sources.inbox.dismiss(request.params.id, mode);
        return reply.code(204).send();
      },
    );
  }
}
