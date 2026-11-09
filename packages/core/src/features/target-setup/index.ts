import path from "node:path";

import type { SliceMigrations } from "../../shared/storage/index.ts";

export { targetSetupModule } from "./module.ts";
export type { TargetSetup } from "./application/target-setup.ts";
export { setupBrief } from "./application/get-brief.ts";
export { draftTools } from "./application/setup-tools.ts";
export { withoutDuplicates } from "./domain/draft-questions.ts";

/** The drizzle-kit migrations of the `target_setup` schema. */
export const targetSetupMigrations: SliceMigrations = {
  schema: "target_setup",
  folder: path.join(import.meta.dirname, "infrastructure", "migrations"),
};
