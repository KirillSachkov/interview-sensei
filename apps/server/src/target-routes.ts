import type { FastifyInstance } from "fastify";

import type { Features } from "./composition.ts";

type Dependencies = Pick<Features, "targets" | "questionBank" | "createDemo" | "runtime">;
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
 * The Target's agent as the page shows it: the Candidate's choice, or the default agent with
 * `chosen: false`. The default is the first available agent; null when none is available.
 */
async function targetAgent({ runtime }: Dependencies, chosen: string | null) {
  if (chosen !== null) {
    return { agent: chosen, chosen: true };
  }
  const agents = await runtime.listAgents();
  return { agent: agents.find((entry) => entry.available)?.agent ?? null, chosen: false };
}

/** The agent from the body: null, or one of the agents the server offers, available or not. */
async function requestedAgent({ runtime }: Dependencies, body: unknown) {
  const agent = field(body, "agent");
  if (agent === null) {
    return { agent };
  }
  const offered = await runtime.listAgents();
  return typeof agent === "string" && offered.some((entry) => entry.agent === agent)
    ? { agent }
    : undefined;
}

/**
 * - `GET /api/targets/:id/agent`: the Target's agent, see targetAgent.
 * - `PUT /api/targets/:id/agent` with `{ agent }`: stores the choice; null clears it.
 */
function registerTargetAgent(server: FastifyInstance, dependencies: Dependencies) {
  const { targets } = dependencies;
  server.get<{ Params: { id: string } }>(
    "/api/targets/:id/agent",
    { schema: { params } },
    async (request, reply) => {
      const target = await targets.get(request.params.id);
      return target === undefined
        ? reply.code(404).send({ error: "target_not_found" })
        : targetAgent(dependencies, target.agent);
    },
  );
  server.put<{ Params: { id: string }; Body: unknown }>(
    "/api/targets/:id/agent",
    { schema: { params } },
    async (request, reply) => {
      const requested = await requestedAgent(dependencies, request.body);
      if (requested === undefined) {
        return reply.code(400).send({ error: "unknown_agent" });
      }
      const found = await targets.setAgent(request.params.id, requested.agent);
      return found
        ? targetAgent(dependencies, requested.agent)
        : reply.code(404).send({ error: "target_not_found" });
    },
  );
}

export function registerTargetRoutes(server: FastifyInstance, dependencies: Dependencies) {
  const { targets, questionBank, createDemo } = dependencies;
  server.post("/api/targets/demo", async (_request, reply) => {
    const { target, created } = await createDemo();
    return reply.code(created ? 201 : 200).send(target);
  });
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
