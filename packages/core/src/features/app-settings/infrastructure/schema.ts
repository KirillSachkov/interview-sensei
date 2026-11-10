import { boolean, integer, pgSchema, text } from "drizzle-orm/pg-core";

export const appSettingsSchema = pgSchema("app_settings");
/** The application's settings: one row with `id` 1, written on the first change. */
export const settings = appSettingsSchema.table("settings", {
  id: integer("id").primaryKey(),
  defaultAgent: text("default_agent"),
  fillInBackground: boolean("fill_in_background").notNull().default(false),
});

/**
 * The Candidate's model and reasoning level of an agent (#111): one row per agent with a stored
 * choice; null leaves the agent's own default.
 */
export const agentModels = appSettingsSchema.table("agent_models", {
  agent: text("agent").primaryKey(),
  model: text("model"),
  effort: text("effort"),
});
