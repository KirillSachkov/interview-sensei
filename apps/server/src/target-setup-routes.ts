import type { FastifyInstance } from "fastify";

import { serverClosingMessage } from "./agent-session-routes.ts";
import type { ArchiveGuard } from "./archive-guard.ts";
import { SessionsClosedError } from "./composition.ts";
import type { Features } from "./composition.ts";
import { params, uuid } from "./route-params.ts";

type Dependencies = Pick<Features, "targets" | "targetSetup" | "sessions" | "runtime"> & {
  readonly archiveGuard: ArchiveGuard;
};

/** The Target's agent cannot start: none is available, or the chosen one is not. */
class AgentUnavailableError extends Error {
  override name = "AgentUnavailableError";
}

const agentUnavailableMessage =
  "Агент цели недоступен. Выберите доступного агента в верхней панели и откройте настройку снова.";

const targetArchivedMessage = "Цель в архиве. Верните её из архива, чтобы настроить.";

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

/**
 * The Target's last setup session that a new one continues (#85): the newest one that no later
 * session continues, unless the Candidate ended it with «Завершить». The server ended it at a
 * restart or shutdown, or its agent failed. `talked` when its chat has messages. Null when the
 * Target has none.
 */
async function setupToContinue({ sessions }: Dependencies, targetId: string) {
  const last = await sessions.lastConversation({ kind: "target-setup", targetId });
  return last === undefined || last.endedByCandidate
    ? null
    : { id: last.sessionId, talked: last.messages.length > 0 };
}

/**
 * The Target's running setup session, or a new one with its agent: it continues the last one
 * after a restart, and starts a draft Target's onboarding otherwise.
 */
async function openSetup(dependencies: Dependencies, targetId: string) {
  const { sessions, targetSetup } = dependencies;
  try {
    return await sessions.open({ kind: "target-setup", targetId }, async () => {
      const agent = await availableAgent(dependencies, targetId);
      const earlier = await setupToContinue(dependencies, targetId);
      const opening = await targetSetup.opening(targetId, { continues: earlier?.talked === true });
      return {
        agent,
        ...(opening === undefined ? {} : { opening }),
        ...(earlier === null ? {} : { continues: earlier.id }),
      };
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

/** The status and body of each reason why the setup session does not open. */
const setupRefusals = {
  target_not_found: [404, { error: "target_not_found" }],
  target_archived: [409, { error: "target_archived", message: targetArchivedMessage }],
  agent_unavailable: [400, { error: "agent_unavailable", message: agentUnavailableMessage }],
  server_closing: [503, { error: "server_closing", message: serverClosingMessage }],
} as const;

function registerSetupSession(server: FastifyInstance, dependencies: Dependencies) {
  server.post<{ Params: { id: string } }>(
    "/api/targets/:id/setup-session",
    { schema: { params } },
    async (request, reply) => {
      const { id } = request.params;
      const opened = await dependencies.archiveGuard.startSession(id, async (target) =>
        target === undefined ? "target_not_found" : openSetup(dependencies, id),
      );
      if (typeof opened === "string") {
        const [code, body] = setupRefusals[opened];
        return reply.code(code).send(body);
      }
      return reply.code(opened.created ? 201 : 200).send(opened.session);
    },
  );
}

function registerSetupEnd(server: FastifyInstance, { targets, sessions }: Dependencies) {
  server.post<{ Params: { id: string } }>(
    "/api/targets/:id/setup-session/end",
    { schema: { params } },
    async (request, reply) => {
      const { id } = request.params;
      if ((await targets.get(id)) === undefined) {
        return reply.code(404).send({ error: "target_not_found" });
      }
      const all = await sessions.list();
      const setups = all.filter(
        (session) => session.kind === "target-setup" && session.targetId === id,
      );
      // Only the live one ends; the others ended before. The next opening starts afresh.
      await Promise.all(
        setups.map(async (session) => sessions.stop(session.id, { byCandidate: true })),
      );
      return reply.code(204).send();
    },
  );
}

const changeParams = {
  type: "object",
  properties: {
    id: uuid,
    changeId: uuid,
  },
  required: ["id", "changeId"],
} as const;

function registerDraftRemoval(server: FastifyInstance, { targets, targetSetup }: Dependencies) {
  server.delete<{ Params: { id: string; changeId: string } }>(
    "/api/targets/:id/draft/changes/:changeId",
    { schema: { params: changeParams } },
    async (request, reply) => {
      const { id, changeId } = request.params;
      if ((await targets.get(id)) === undefined) {
        return reply.code(404).send({ error: "target_not_found" });
      }
      return (await targetSetup.removeChange(id, changeId))
        ? reply.code(204).send()
        : reply.code(404).send({ error: "change_not_found" });
    },
  );
  server.delete<{ Params: { id: string } }>(
    "/api/targets/:id/draft",
    { schema: { params } },
    async (request, reply) => {
      const { id } = request.params;
      if ((await targets.get(id)) === undefined) {
        return reply.code(404).send({ error: "target_not_found" });
      }
      await targetSetup.discard(id);
      return reply.code(204).send();
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
 *   201. A new session continues the last one unless the Candidate ended it with «Завершить»
 *   (#85): its `continuesSessionId` names it, its chat starts with the earlier one, and its
 *   `get_brief` holds the last messages. Otherwise a draft Target's new session starts with the
 *   onboarding. 400 `agent_unavailable` when
 *   the Target's agent cannot start, 409 `target_archived` for an archived Target, 503
 *   `server_closing` once the server shuts down.
 * - `GET /api/targets/:id/draft`: `{ changes }`, the draft of changes in the order of recording;
 *   a plan change has `merges`, the `from` names of its renames that merge into a Topic.
 * - `POST /api/targets/:id/draft/apply`: writes the whole draft and answers the Target; 409
 *   `draft_empty`, or 409 `draft_invalid` with `problems` and the Target unchanged.
 * - `POST /api/targets/:id/setup-session/end`: «Завершить», 204; ends the running setup session,
 *   and the draft stays; the next session starts afresh.
 * - `DELETE /api/targets/:id/draft/changes/:changeId`: ✕ of one change, 204; 404
 *   `change_not_found` when the Target's draft has no such change.
 * - `DELETE /api/targets/:id/draft`: «Отменить изменения», 204; empties the draft.
 *
 * Each answers 404 `target_not_found` for an unknown Target.
 */
export function registerTargetSetupRoutes(server: FastifyInstance, dependencies: Dependencies) {
  registerSetupSession(server, dependencies);
  registerSetupEnd(server, dependencies);
  registerDraft(server, dependencies);
  registerDraftRemoval(server, dependencies);
}
