import { integer, pgSchema, text } from "drizzle-orm/pg-core";

export const appSettingsSchema = pgSchema("app_settings");
/** The application's settings: one row with `id` 1, written on the first change. */
export const settings = appSettingsSchema.table("settings", {
  id: integer("id").primaryKey(),
  defaultAgent: text("default_agent"),
});
