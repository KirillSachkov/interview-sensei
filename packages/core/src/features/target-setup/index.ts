import path from "node:path";

import type { SliceMigrations } from "../../shared/storage/index.ts";

export { targetSetupModule } from "./module.ts";
export type { TargetSetup } from "./application/target-setup.ts";
export { setupBrief } from "./application/get-brief.ts";
export { applyChanges, setInterviewPlan, updateTarget } from "./application/draft-tools.ts";

/** The drizzle-kit migrations of the `target_setup` schema. */
export const targetSetupMigrations: SliceMigrations = {
  schema: "target_setup",
  folder: path.join(import.meta.dirname, "infrastructure", "migrations"),
};
