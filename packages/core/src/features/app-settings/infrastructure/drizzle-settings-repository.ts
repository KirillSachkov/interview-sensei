import { eq } from "drizzle-orm";

import type { Database } from "../../../shared/storage/index.ts";
import type { SettingsRepository } from "../domain/ports.ts";
import { agentModels, settings } from "./schema.ts";

/** The id of the one settings row. */
const row = 1;

/** The application's settings in the `app_settings` Postgres schema. */
export function drizzleSettingsRepository(database: Database): SettingsRepository {
  return {
    get: async () => {
      const [stored] = await database.select().from(settings).where(eq(settings.id, row));
      const models = await database.select().from(agentModels).orderBy(agentModels.agent);
      return {
        defaultAgent: stored?.defaultAgent ?? null,
        fillInBackground: stored?.fillInBackground ?? false,
        agentModels: Object.fromEntries(
          models.map(({ agent, model, effort }) => [agent, { model, effort }]),
        ),
      };
    },
    setDefaultAgent: async (agent) => {
      await database
        .insert(settings)
        .values({ id: row, defaultAgent: agent })
        .onConflictDoUpdate({ target: settings.id, set: { defaultAgent: agent } });
    },
    setFillInBackground: async (enabled) => {
      await database
        .insert(settings)
        .values({ id: row, fillInBackground: enabled })
        .onConflictDoUpdate({ target: settings.id, set: { fillInBackground: enabled } });
    },
    setAgentModel: async (agent, choice) => {
      await database
        .insert(agentModels)
        .values({ agent, ...choice })
        .onConflictDoUpdate({ target: agentModels.agent, set: choice });
    },
  };
}
