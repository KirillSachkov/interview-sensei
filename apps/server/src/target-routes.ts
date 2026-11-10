import type { FastifyInstance } from "fastify";

import { UnknownAgentError } from "./composition.ts";
import type { Features } from "./composition.ts";
import { registerQuestionReviewRoutes } from "./question-review-routes.ts";
import { registerSettingsRoutes } from "./settings-routes.ts";
import { registerTargetArchiveRoutes } from "./target-archive-routes.ts";
import { onlyField, params, uuid } from "./route-params.ts";

type Dependencies = Pick<Features, "targets" | "questionBank" | "createDemo">;

interface QuestionQuery {
  topicId?: string;
  sectionId?: string;
  hidden?: boolean;
  referenceCheck?: boolean;
}

/**
 * `GET /api/targets/:id/questions`: the Target's visible Questions, or its hidden ones with
 * `hidden=true`; `topicId` or `sectionId` keeps those of one Topic or of one Section's Topics, and
 * `referenceCheck=true` those of the list «проверить опорный ответ».
 */
function registerQuestions(server: FastifyInstance, { targets, questionBank }: Dependencies) {
  server.get<{ Params: { id: string }; Querystring: QuestionQuery }>(
    "/api/targets/:id/questions",
    {
      schema: {
        params,
        querystring: {
          type: "object",
          properties: {
            topicId: uuid,
            sectionId: uuid,
            hidden: { type: "boolean" },
            referenceCheck: { type: "boolean" },
          },
          additionalProperties: false,
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params;
      const { sectionId, ...filter } = request.query;
      if ((await targets.get(id)) === undefined) {
        return reply.code(404).send({ error: "target_not_found" });
      }
      if (sectionId === undefined) {
        return questionBank.search(id, filter);
      }
      const topicIds = await targets.topicIds(id, sectionId);
      return topicIds === undefined
        ? reply.code(404).send({ error: "section_not_found" })
        : questionBank.search(id, { ...filter, topicIds });
    },
  );
}

/**
 * The rating and visibility of one Question, «проверен» of its reference answer, and the bulk
 * review of several.
 */
function registerQuestionWrites(server: FastifyInstance, dependencies: Dependencies) {
  const { questionBank } = dependencies;
  registerQuestionReviewRoutes(server, dependencies);
  server.put<{ Params: { id: string }; Body: unknown }>(
    "/api/questions/:id/rating",
    { schema: { params } },
    async (request, reply) => {
      const rating = onlyField(request.body, "rating");
      if (rating !== null && rating !== "useful" && rating !== "irrelevant" && rating !== "wrong") {
        return reply.code(400).send({ error: "invalid_rating" });
      }
      const found = await questionBank.rate(request.params.id, rating);
      return found ? reply.code(204).send() : reply.code(404).send({ error: "question_not_found" });
    },
  );
  server.put<{ Params: { id: string }; Body: unknown }>(
    "/api/questions/:id/hidden",
    { schema: { params } },
    async (request, reply) => {
      const hidden = onlyField(request.body, "hidden");
      if (typeof hidden !== "boolean") {
        return reply.code(400).send({ error: "invalid_hidden" });
      }
      const found = await questionBank.hide(request.params.id, hidden);
      return found ? reply.code(204).send() : reply.code(404).send({ error: "question_not_found" });
    },
  );
}

const sectionParams = {
  type: "object",
  properties: { id: uuid, sectionId: uuid },
  required: ["id", "sectionId"],
} as const;

/**
 * `PUT /api/targets/:id/sections/:sectionId/enabled` with `{ enabled }`: switches the Section on or
 * off at once, without the draft of changes, and answers the Target.
 */
function registerSections(server: FastifyInstance, { targets }: Dependencies) {
  server.put<{ Params: { id: string; sectionId: string }; Body: unknown }>(
    "/api/targets/:id/sections/:sectionId/enabled",
    { schema: { params: sectionParams } },
    async (request, reply) => {
      const enabled = onlyField(request.body, "enabled");
      if (typeof enabled !== "boolean") {
        return reply.code(400).send({ error: "invalid_enabled" });
      }
      const { id, sectionId } = request.params;
      const target = await targets.setSectionEnabled(id, sectionId, enabled);
      return typeof target === "string" || target === undefined
        ? reply.code(404).send({ error: target ?? "target_not_found" })
        : target;
    },
  );
}

/**
 * - `GET /api/targets/:id/agent`: the Target's agent, see `Targets.agent`.
 * - `PUT /api/targets/:id/agent` with `{ agent }`: stores the choice; null clears it.
 * - The default agent of «Настройки»: see registerSettingsRoutes.
 */
function registerTargetAgent(
  server: FastifyInstance,
  dependencies: Dependencies & Parameters<typeof registerSettingsRoutes>[1],
) {
  const { targets } = dependencies;
  // The default agent of «Настройки» is the agent of every Target without its own.
  registerSettingsRoutes(server, dependencies);
  server.get<{ Params: { id: string } }>(
    "/api/targets/:id/agent",
    { schema: { params } },
    async (request, reply) =>
      (await targets.agent(request.params.id)) ??
      reply.code(404).send({ error: "target_not_found" }),
  );
  server.put<{ Params: { id: string }; Body: unknown }>(
    "/api/targets/:id/agent",
    { schema: { params } },
    async (request, reply) => {
      const agent = onlyField(request.body, "agent");
      if (agent !== null && typeof agent !== "string") {
        return reply.code(400).send({ error: "unknown_agent" });
      }
      const saved = await targets.setAgent(request.params.id, agent).catch((error: unknown) => {
        if (error instanceof UnknownAgentError) {
          return "unknown_agent" as const;
        }
        throw error;
      });
      if (saved === "unknown_agent") {
        return reply.code(400).send({ error: saved });
      }
      return saved ?? reply.code(404).send({ error: "target_not_found" });
    },
  );
}

export function registerTargetRoutes(
  server: FastifyInstance,
  dependencies: Dependencies &
    Parameters<typeof registerTargetArchiveRoutes>[1] &
    Parameters<typeof registerSettingsRoutes>[1],
) {
  const { targets, createDemo } = dependencies;
  server.post("/api/targets/demo", async (_request, reply) => {
    const { target, created } = await createDemo();
    return reply.code(created ? 201 : 200).send(target);
  });
  server.post("/api/targets", async (_request, reply) =>
    reply.code(201).send(await targets.create()),
  );
  server.get("/api/targets", async () => targets.list());
  server.get<{ Params: { id: string } }>(
    "/api/targets/:id",
    { schema: { params } },
    async (request, reply) =>
      (await targets.get(request.params.id)) ?? reply.code(404).send({ error: "target_not_found" }),
  );
  registerQuestions(server, dependencies);
  registerQuestionWrites(server, dependencies);
  registerSections(server, dependencies);
  registerTargetArchiveRoutes(server, dependencies);
  registerTargetAgent(server, dependencies);
}
