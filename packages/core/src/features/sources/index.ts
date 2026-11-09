import path from "node:path";

import type { SliceMigrations } from "../../shared/storage/index.ts";

export { sourcesModule } from "./module.ts";
export { getSource, listSources, sourceTools } from "./application/source-tools.ts";
export type { AttachedFile, SaveOutcome, Sources, SourceView } from "./application/sources.ts";

/** The drizzle-kit migrations of the `sources` schema. */
export const sourcesMigrations: SliceMigrations = {
  schema: "sources",
  folder: path.join(import.meta.dirname, "infrastructure", "migrations"),
};
