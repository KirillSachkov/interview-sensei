import type { Database } from "../../shared/storage/index.ts";
import { createAppSettings } from "./application/app-settings.ts";
import type { OfferedAgents } from "./domain/ports.ts";
import { drizzleSettingsRepository } from "./infrastructure/drizzle-settings-repository.ts";

/** The application's settings on the server's database. */
export function appSettingsModule({
  database,
  agents,
}: {
  database: Database;
  /** The agents the server offers: the default agent is one of them. */
  agents: OfferedAgents;
}) {
  return createAppSettings({ repository: drizzleSettingsRepository(database), agents });
}
