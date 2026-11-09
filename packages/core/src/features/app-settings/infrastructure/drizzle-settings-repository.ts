import { eq } from "drizzle-orm";

import type { Database } from "../../../shared/storage/index.ts";
import type { SettingsRepository } from "../domain/ports.ts";
import { settings } from "./schema.ts";

/** The id of the one settings row. */
const row = 1;

/** The application's settings in the `app_settings` Postgres schema. */
export function drizzleSettingsRepository(database: Database): SettingsRepository {
  return {
    get: async () => {
      const [stored] = await database.select().from(settings).where(eq(settings.id, row));
      return { defaultAgent: stored?.defaultAgent ?? null };
    },
    setDefaultAgent: async (agent) => {
      await database
        .insert(settings)
        .values({ id: row, defaultAgent: agent })
        .onConflictDoUpdate({ target: settings.id, set: { defaultAgent: agent } });
    },
  };
}
