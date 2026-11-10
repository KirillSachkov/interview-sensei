// The model and the reasoning level of an agent (#111): the Candidate changes them in a session's
// chat, and «Настройки» reads what an agent offers without a session.
import type { FastifyInstance, FastifyReply } from "fastify";

import type { AgentRuntime, AgentSessions } from "./composition.ts";
import { params } from "./route-params.ts";

type OptionChange = Parameters<AgentSessions["setOptions"]>[1];

/** The body `{ model?, effort? }` with at least one of them, each a string; undefined otherwise. */
function changeOf(body: unknown): OptionChange | undefined {
  if (typeof body !== "object" || body === null) {
    return undefined;
  }
  const keys = Object.keys(body);
  const model: unknown = Reflect.get(body, "model");
  const effort: unknown = Reflect.get(body, "effort");
  const known = keys.length > 0 && keys.every((key) => key === "model" || key === "effort");
  const strings = [model, effort].every(
    (value) => value === undefined || typeof value === "string",
  );
  if (!known || !strings) {
    return undefined;
  }
  return {
    ...(typeof model === "string" ? { model } : {}),
    ...(typeof effort === "string" ? { effort } : {}),
  };
}

async function setOptions(
  sessions: AgentSessions,
  { sessionId, body }: { sessionId: string; body: unknown },
  reply: FastifyReply,
) {
  const change = changeOf(body);
  if (change === undefined) {
    return reply.code(400).send({ error: "invalid_request" });
  }
  const outcome = await sessions.setOptions(sessionId, change);
  switch (outcome) {
    case "not_found": {
      return reply.code(404).send({ error: "session_not_found" });
    }
    case "busy": {
      return reply.code(409).send({ error: "session_busy" });
    }
    case "unknown_option": {
      return reply.code(400).send({ error: "unknown_option" });
    }
    default: {
      return outcome;
    }
  }
}

/** A query value that came once and is not empty; null otherwise. */
function textOf(value: unknown): string | null {
  return typeof value === "string" && value !== "" ? value : null;
}

async function probe(
  runtime: AgentRuntime,
  { agent, query }: { agent: string; query: { model?: unknown; refresh?: unknown } },
  reply: FastifyReply,
) {
  const outcome = await runtime.probeOptions(agent, {
    model: textOf(query.model),
    refresh: query.refresh === "1",
  });
  switch (outcome.type) {
    case "options": {
      return outcome.options;
    }
    case "not_offered": {
      return reply.code(404).send({ error: "agent_not_found" });
    }
    case "unavailable": {
      return reply.code(409).send({ error: "agent_unavailable", reason: outcome.reason });
    }
    case "failed": {
      return reply.code(502).send({ error: "probe_failed", message: outcome.message });
    }
    default: {
      return outcome satisfies never;
    }
  }
}

/**
 * The model and the reasoning level, as `{ model, effort }` where each is
 * `{ current, values: [{ value, name }] }` or null when the agent offers no such option:
 * - `PUT /api/sessions/:id/options` with `{ model?, effort? }`, at least one: sets them in the
 *   session, the model first, and answers the session view. 400 `invalid_request` for another body;
 *   404 `session_not_found`; 409 `session_busy` unless the session is `idle`; 400 `unknown_option`
 *   when the agent offers no such option or not this value. A refused level leaves the model that
 *   the same request set.
 * - `GET /api/agents/:agent/options`: what the agent offers, read by starting it without a prompt,
 *   so it spends no subscription; with `?model=<value>`, after choosing that model, which gives its
 *   levels. The server keeps each answer in memory; `?refresh=1` reads the agent again. 404
 *   `agent_not_found` for an agent the server does not offer; 409 `agent_unavailable` with `reason`
 *   when it cannot run now; 502 `probe_failed` with `message` when it did not open a session.
 */
export function registerAgentOptionRoutes(
  server: FastifyInstance,
  { runtime, sessions }: { runtime: AgentRuntime; sessions: AgentSessions },
): void {
  server.put<{ Params: { id: string }; Body: unknown }>(
    "/api/sessions/:id/options",
    { schema: { params } },
    async (request, reply) =>
      setOptions(sessions, { sessionId: request.params.id, body: request.body }, reply),
  );
  server.get<{ Params: { agent: string }; Querystring: { model?: unknown; refresh?: unknown } }>(
    "/api/agents/:agent/options",
    async (request, reply) =>
      probe(runtime, { agent: request.params.agent, query: request.query }, reply),
  );
}
