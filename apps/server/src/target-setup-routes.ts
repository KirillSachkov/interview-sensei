import type { FastifyInstance } from "fastify";

import { serverClosingMessage } from "./agent-session-routes.ts";
import { SessionsClosedError } from "./composition.ts";
import type { Features } from "./composition.ts";

type Dependencies = Pick<Features, "targets" | "targetSetup" | "sessions" | "runtime">;

const params = {
  type: "object",
  properties: { id: { type: "string", format: "uuid" } },
  required: ["id"],
} as const;

/** The Target's agent cannot start: none is available, or the chosen one is not. */
class AgentUnavailableError extends Error {
  override name = "AgentUnavailableError";
}

const agentUnavailableMessage =
  "Агент цели недоступен. Выберите доступного агента в верхней панели и откройте настройку снова.";

/** The Target's agent when the server can start it now. */
async function availableAgent({ targets, runtime }: Dependencies, targetId: string) {
  const chosen = await targets.agent(targetId);
  const agents = await runtime.listAgents();
  const agent = chosen?.agent ?? null;
  if (agent === null || !agents.some((offered) => offered.agent === agent && offered.available)) {
    throw new AgentUnavailableError(`The agent of the Target ${targetId} is unavailable`);
  }
  return agent;
}

/** The Target's running setup session, or a new one with its agent and onboarding prompt. */
async function openSetup(dependencies: Dependencies, targetId: string) {
  const { sessions, targetSetup } = dependencies;
  try {
    return await sessions.open({ kind: "target-setup", targetId }, async () => {
      const agent = await availableAgent(dependencies, targetId);
      const opening = await targetSetup.opening(targetId);
      return { agent, ...(opening === undefined ? {} : { opening }) };
    });
  } catch (error) {
    if (error instanceof AgentUnavailableError) {
      return "agent_unavailable" as const;
    }
    if (error instanceof SessionsClosedError) {
      return "server_closing" as const;
    }
    throw error;
  }
}

function registerSetupSession(server: FastifyInstance, dependencies: Dependencies) {
  server.post<{ Params: { id: string } }>(
    "/api/targets/:id/setup-session",
    { schema: { params } },
    async (request, reply) => {
      const { id } = request.params;
      if ((await dependencies.targets.get(id)) === undefined) {
        return reply.code(404).send({ error: "target_not_found" });
      }
      const opened = await openSetup(dependencies, id);
      if (opened === "agent_unavailable") {
        return reply.code(400).send({ error: opened, message: agentUnavailableMessage });
      }
      if (opened === "server_closing") {
        return reply.code(503).send({ error: opened, message: serverClosingMessage });
      }
      return reply.code(opened.created ? 201 : 200).send(opened.session);
    },
  );
}

function registerDraft(server: FastifyInstance, { targets, targetSetup }: Dependencies) {
  server.get<{ Params: { id: string } }>(
    "/api/targets/:id/draft",
    { schema: { params } },
    async (request, reply) => {
      const changes = await targetSetup.draft(request.params.id);
      return changes === undefined
        ? reply.code(404).send({ error: "target_not_found" })
        : { changes };
    },
  );
  server.post<{ Params: { id: string } }>(
    "/api/targets/:id/draft/apply",
    { schema: { params } },
    async (request, reply) => {
      const { id } = request.params;
      const applied = await targetSetup.apply(id);
      switch (applied.outcome) {
        case "applied": {
          return targets.get(id);
        }
        case "not_found": {
          return reply.code(404).send({ error: "target_not_found" });
        }
        case "empty": {
          return reply.code(409).send({ error: "draft_empty" });
        }
        case "invalid": {
          return reply.code(409).send({ error: "draft_invalid", problems: applied.problems });
        }
        default: {
          return applied satisfies never;
        }
      }
    },
  );
}

/**
 * The HTTP API of the Target setup:
 * - `POST /api/targets/:id/setup-session`: the Target's running setup session, 200, or a new one,
 *   201; a draft Target's new session starts with the onboarding. 400 `agent_unavailable` when
 *   the Target's agent cannot start, 503 `server_closing` once the server shuts down.
 * - `GET /api/targets/:id/draft`: `{ changes }`, the draft of changes in the order of recording.
 * - `POST /api/targets/:id/draft/apply`: writes the whole draft and answers the Target; 409
 *   `draft_empty`, or 409 `draft_invalid` with `problems` and the Target unchanged.
 */
export function registerTargetSetupRoutes(server: FastifyInstance, dependencies: Dependencies) {
  registerSetupSession(server, dependencies);
  registerDraft(server, dependencies);
}
