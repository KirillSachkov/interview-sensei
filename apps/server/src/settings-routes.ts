import type { FastifyInstance } from "fastify";

import type { Features } from "./composition.ts";
import { onlyField } from "./route-params.ts";
import { registerTranscriptionRoutes } from "./transcription-routes.ts";

/** The agent in a body that has only this field: a string, or null to clear the choice. */
function agentOf(body: unknown): string | null | undefined {
  const agent = onlyField(body, "agent");
  return agent === null || typeof agent === "string" ? agent : undefined;
}

/** A string or null as it is; undefined for another value or a missing field. */
function textOrNull(value: unknown): string | null | undefined {
  return value === null || typeof value === "string" ? value : undefined;
}

/** The body `{ model, effort }`, each a string or null, with no other field; undefined otherwise. */
function agentModelOf(body: unknown): { model: string | null; effort: string | null } | undefined {
  if (typeof body !== "object" || body === null || Object.keys(body).length !== 2) {
    return undefined;
  }
  const model = textOrNull(Reflect.get(body, "model"));
  const effort = textOrNull(Reflect.get(body, "effort"));
  return model === undefined || effort === undefined ? undefined : { model, effort };
}

/**
 * `PUT /api/settings/agent-models/:agent` with `{ model, effort }`: stores the model and the
 * reasoning level that every new session of the agent starts with (#111); null leaves the agent's
 * own default. Answers the settings. 400 `invalid_request` for another body, 400 `unknown_agent`
 * for an agent the server does not offer.
 */
function registerAgentModelRoute(server: FastifyInstance, appSettings: Features["appSettings"]) {
  server.put<{ Params: { agent: string }; Body: unknown }>(
    "/api/settings/agent-models/:agent",
    async (request, reply) => {
      const choice = agentModelOf(request.body);
      if (choice === undefined) {
        return reply.code(400).send({ error: "invalid_request" });
      }
      const saved = await appSettings.setAgentModel(request.params.agent, choice);
      return saved === "unknown_agent" ? reply.code(400).send({ error: saved }) : saved;
    },
  );
}

/**
 * The application's settings, which «Настройки» changes:
 * - `GET /api/settings`: `{ defaultAgent, fillInBackground, agentModels }`; the default agent is
 *   null until the Candidate chooses one, «Наполнять в фоне» is off until the Candidate turns it
 *   on, and `agentModels` has `{ model, effort }` only for the agents with a stored choice.
 * - `PUT /api/settings/agent-models/:agent`: see registerAgentModelRoute.
 * - `PUT /api/settings/default-agent` with `{ agent }`: stores the default agent of the Targets
 *   without their own; null returns them to the first available agent. 400 `unknown_agent` for an
 *   agent the server does not offer.
 * - `PUT /api/settings/fill-in-background` with `{ enabled }`: turns «Наполнять в фоне» on or off.
 * - «Распознавание речи»: see registerTranscriptionRoutes.
 */
export function registerSettingsRoutes(
  server: FastifyInstance,
  { appSettings, transcription }: Pick<Features, "appSettings" | "transcription">,
) {
  server.get("/api/settings", async () => appSettings.settings());
  server.put<{ Body: unknown }>("/api/settings/default-agent", async (request, reply) => {
    const agent = agentOf(request.body);
    const saved = agent === undefined ? "unknown_agent" : await appSettings.setDefaultAgent(agent);
    return saved === "unknown_agent" ? reply.code(400).send({ error: saved }) : saved;
  });
  server.put<{ Body: { enabled: boolean } }>(
    "/api/settings/fill-in-background",
    {
      schema: {
        body: {
          type: "object",
          properties: { enabled: { type: "boolean" } },
          required: ["enabled"],
          additionalProperties: false,
        },
      },
    },
    async (request, reply) =>
      reply.send(await appSettings.setFillInBackground(request.body.enabled)),
  );
  registerAgentModelRoute(server, appSettings);
  registerTranscriptionRoutes(server, { transcription });
}
