import path from "node:path";
import type { SliceMigrations } from "../../shared/storage/index.ts";

export { targetsModule } from "./module.ts";
export { UnknownAgentError } from "./application/targets.ts";
export type { Targets } from "./application/targets.ts";
export const targetsMigrations: SliceMigrations = {
  schema: "targets",
  folder: path.join(import.meta.dirname, "infrastructure", "migrations"),
};

export { getTarget } from "./application/get-target.ts";
