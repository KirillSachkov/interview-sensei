import path from "node:path";

import type { SliceMigrations } from "../../shared/storage/index.ts";

export { answerSearchModule } from "./module.ts";
export { answerTools } from "./application/answer-tools.ts";
export type { AnswerSearch } from "./application/answer-search.ts";
export type { StartOutcome as AnswerStartOutcome } from "./application/answer-start.ts";

/** The drizzle-kit migrations of the `answer_search` schema. */
export const answerSearchMigrations: SliceMigrations = {
  schema: "answer_search",
  folder: path.join(import.meta.dirname, "infrastructure", "migrations"),
};
