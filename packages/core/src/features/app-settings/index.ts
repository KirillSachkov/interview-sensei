import path from "node:path";

import type { SliceMigrations } from "../../shared/storage/index.ts";

export { appSettingsModule } from "./module.ts";
export type { AppSettingsService } from "./application/app-settings.ts";

/** The drizzle-kit migrations of the `app_settings` schema. */
export const appSettingsMigrations: SliceMigrations = {
  schema: "app_settings",
  folder: path.join(import.meta.dirname, "infrastructure", "migrations"),
};
