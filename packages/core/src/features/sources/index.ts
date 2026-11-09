import path from "node:path";

import type { SliceMigrations } from "../../shared/storage/index.ts";

export { sourcesModule } from "./module.ts";
export { getSource, listSources, sourceTools } from "./application/source-tools.ts";
export { inboxTools, proposeInboxProcessing, proposeRecheck } from "./application/inbox-tools.ts";
export type { AttachedFile, SaveOutcome, Sources, SourceView } from "./application/sources.ts";
export type { Inbox } from "./application/inbox.ts";
export type { StartOutcome as InboxStartOutcome } from "./application/inbox-start.ts";

/** The drizzle-kit migrations of the `sources` schema. */
export const sourcesMigrations: SliceMigrations = {
  schema: "sources",
  folder: path.join(import.meta.dirname, "infrastructure", "migrations"),
};
