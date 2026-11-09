import type { FastifyInstance, FastifyReply } from "fastify";

import type { ArchiveGuard } from "./archive-guard.ts";
import type { Features, InboxStartOutcome } from "./composition.ts";
import { params, uuid } from "./route-params.ts";

type Dependencies = Pick<Features, "sources"> & { readonly archiveGuard: ArchiveGuard };

const otherAgentHint = "Или выберите другого агента в меню «Агент» в верхней панели.";

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
    case "no_sources": {
      return reply
        .code(400)
        .send({ error: outcome.type, message: "Нет материалов, которые ждут разбора." });
    }
    case "invalid_sources": {
      return reply.code(400).send({
        error: outcome.type,
        message: "Часть выбранных материалов уже разобрана или удалена. Обновите список.",
      });
    }
    case "processing_running": {
      return reply.code(409).send({
        error: outcome.type,
        message: "По этой цели уже идёт разбор. Новые материалы подождут следующего запуска.",
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

const reportParams = {
  type: "object",
  properties: { id: uuid, reportId: uuid },
  required: ["id", "reportId"],
} as const;

function registerReads(server: FastifyInstance, { sources }: Dependencies) {
  server.get<{ Params: { id: string } }>(
    "/api/targets/:id/inbox",
    { schema: { params } },
    async (request, reply) => {
      const state = await sources.inbox.state(request.params.id);
      return state === undefined ? reply.code(404).send({ error: "target_not_found" }) : state;
    },
  );
  server.get<{ Params: { id: string; reportId: string } }>(
    "/api/targets/:id/inbox-reports/:reportId",
    { schema: { params: reportParams } },
    async (request, reply) => {
      const report = await sources.inbox.report(request.params.id, request.params.reportId);
      return report === undefined ? reply.code(404).send({ error: "report_not_found" }) : report;
    },
  );
}

function registerStop(server: FastifyInstance, { sources }: Dependencies) {
  server.post<{ Params: { id: string } }>(
    "/api/targets/:id/inbox/processing/stop",
    { schema: { params } },
    async (request, reply) => {
      const outcome = await sources.inbox.stop(request.params.id);
      switch (outcome.type) {
        case "stopped": {
          return { reportId: outcome.report.id };
        }
        case "target_not_found": {
          return reply.code(404).send({ error: outcome.type });
        }
        case "not_running": {
          return reply
            .code(409)
            .send({ error: outcome.type, message: "Разбор уже закончился. Обновите страницу." });
        }
        default: {
          return outcome satisfies never;
        }
      }
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
 * - `POST /api/targets/:id/inbox/processing/stop`: «Остановить разбор»; the server closes the
 *   processing with a partial Inbox report and stops its agent; 200 `{ reportId }`, 409
 *   `not_running` when no processing runs.
 * - `POST /api/targets/:id/inbox/proposal/dismiss`: «Не сейчас»; the materials stay in the Inbox.
 * - `GET /api/targets/:id/inbox-reports/:reportId`: the Inbox report with the added Questions by
 *   Section and Topic.
 */
export function registerInboxRoutes(server: FastifyInstance, dependencies: Dependencies) {
  registerStart(server, dependencies);
  registerStop(server, dependencies);
  registerReads(server, dependencies);
  server.post<{ Params: { id: string } }>(
    "/api/targets/:id/inbox/proposal/dismiss",
    { schema: { params } },
    async (request, reply) => {
      if ((await dependencies.sources.list(request.params.id)) === undefined) {
        return reply.code(404).send({ error: "target_not_found" });
      }
      await dependencies.sources.inbox.dismiss(request.params.id);
      return reply.code(204).send();
    },
  );
}
