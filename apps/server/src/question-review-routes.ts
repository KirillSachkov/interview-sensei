import type { FastifyInstance } from "fastify";

import type { Features } from "./composition.ts";
import { params, uuid } from "./route-params.ts";

type Dependencies = Pick<Features, "targets" | "questionBank">;

interface ReviewBody {
  readonly action: "hide" | "delete" | "warn" | "confirm";
  readonly questionIds: string[];
  readonly comment?: string;
}

/**
 * `POST /api/targets/:id/questions/review` with `{ action, questionIds, comment? }`: the Candidate's
 * bulk review of the Target's Questions, such as the Questions of an Inbox report.
 * - `hide`; `delete`, which hides a Question with Attempts instead;
 * - `warn`: ⚠, the rating «ошибка», with the optional comment;
 * - `confirm`: 👍, the rating useful, which removes «не подтверждён».
 *
 * Answers `{ deleted, changed }`: the ids deleted for good and the ids changed. 400
 * `unknown_questions` when a Question is not the Target's; nothing changes then.
 */
export function registerQuestionReviewRoutes(
  server: FastifyInstance,
  { targets, questionBank }: Dependencies,
) {
  registerReferenceCheck(server, { questionBank });
  server.post<{ Params: { id: string }; Body: ReviewBody }>(
    "/api/targets/:id/questions/review",
    {
      schema: {
        params,
        body: {
          type: "object",
          properties: {
            action: { type: "string", enum: ["hide", "delete", "warn", "confirm"] },
            questionIds: { type: "array", items: uuid, minItems: 1, maxItems: 1000 },
            comment: { type: "string", maxLength: 2000 },
          },
          required: ["action", "questionIds"],
          additionalProperties: false,
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params;
      if ((await targets.get(id)) === undefined) {
        return reply.code(404).send({ error: "target_not_found" });
      }
      const { action, questionIds, comment } = request.body;
      const trimmed = comment?.trim() ?? "";
      const outcome = await questionBank.review(id, {
        action,
        questionIds,
        comment: trimmed === "" ? null : trimmed,
      });
      return outcome === "unknown_questions"
        ? reply.code(400).send({
            error: outcome,
            message: "Часть вопросов уже удалена или относится к другой цели. Обновите список.",
          })
        : outcome;
    },
  );
}

/**
 * `POST /api/questions/:id/reference-answer/verified`: «проверен». The reference answer gets the
 * origin «проверен кандидатом», and the Question leaves the list «проверить опорный ответ». 204; 404
 * `question_not_found`; 409 `no_reference_answer` for a Question without one.
 */
function registerReferenceCheck(
  server: FastifyInstance,
  { questionBank }: Pick<Dependencies, "questionBank">,
) {
  server.post<{ Params: { id: string } }>(
    "/api/questions/:id/reference-answer/verified",
    { schema: { params } },
    async (request, reply) => {
      const outcome = await questionBank.verifyReferenceAnswer(request.params.id);
      switch (outcome) {
        case "verified": {
          return reply.code(204).send();
        }
        case "not_found": {
          return reply.code(404).send({ error: "question_not_found" });
        }
        case "no_reference_answer": {
          return reply.code(409).send({ error: outcome });
        }
        default: {
          return outcome satisfies never;
        }
      }
    },
  );
}
