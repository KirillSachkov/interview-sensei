import type { FastifyInstance } from "fastify";

import { UnknownAgentError } from "./composition.ts";
import type { Features } from "./composition.ts";

type Dependencies = Pick<Features, "targets" | "questionBank" | "createDemo">;
const params = {
  type: "object",
  properties: { id: { type: "string", format: "uuid" } },
  required: ["id"],
} as const;

/** Body checks keep JSON types strict; Fastify's default schema compiler coerces booleans. */
function field(body: unknown, key: string): unknown {
  return typeof body === "object" && body !== null && Object.keys(body).length === 1 && key in body
    ? Reflect.get(body, key)
    : undefined;
}

function registerQuestionWrites(server: FastifyInstance, { questionBank }: Dependencies) {
  server.put<{ Params: { id: string }; Body: unknown }>(
    "/api/questions/:id/rating",
    { schema: { params } },
    async (request, reply) => {
      const rating = field(request.body, "rating");
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
      const hidden = field(request.body, "hidden");
      if (typeof hidden !== "boolean") {
        return reply.code(400).send({ error: "invalid_hidden" });
      }
      const found = await questionBank.hide(request.params.id, hidden);
      return found ? reply.code(204).send() : reply.code(404).send({ error: "question_not_found" });
    },
  );
}

/**
 * - `GET /api/targets/:id/agent`: the Target's agent, see `Targets.agent`.
 * - `PUT /api/targets/:id/agent` with `{ agent }`: stores the choice; null clears it.
 */
function registerTargetAgent(server: FastifyInstance, { targets }: Dependencies) {
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
      const agent = field(request.body, "agent");
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

export function registerTargetRoutes(server: FastifyInstance, dependencies: Dependencies) {
  const { targets, questionBank, createDemo } = dependencies;
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
  server.get<{ Params: { id: string }; Querystring: { topicId?: string; hidden?: boolean } }>(
    "/api/targets/:id/questions",
    {
      schema: {
        params,
        querystring: {
          type: "object",
          properties: { topicId: { type: "string", format: "uuid" }, hidden: { type: "boolean" } },
          additionalProperties: false,
        },
      },
    },
    async (request, reply) => {
      if ((await targets.get(request.params.id)) === undefined) {
        return reply.code(404).send({ error: "target_not_found" });
      }
      return questionBank.search(request.params.id, request.query);
    },
  );
  registerQuestionWrites(server, dependencies);
  registerTargetAgent(server, dependencies);
}
