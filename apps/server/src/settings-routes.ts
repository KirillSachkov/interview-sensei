import type { FastifyInstance } from "fastify";

import type { Features } from "./composition.ts";
import { onlyField } from "./route-params.ts";
import { registerTranscriptionRoutes } from "./transcription-routes.ts";

/** The agent in a body that has only this field: a string, or null to clear the choice. */
function agentOf(body: unknown): string | null | undefined {
  const agent = onlyField(body, "agent");
  return agent === null || typeof agent === "string" ? agent : undefined;
}

/**
 * The application's settings, which «Настройки» changes:
 * - `GET /api/settings`: `{ defaultAgent, fillInBackground }`; the default agent is null until the
 *   Candidate chooses one, and «Наполнять в фоне» is off until the Candidate turns it on.
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
  registerTranscriptionRoutes(server, { transcription });
}
