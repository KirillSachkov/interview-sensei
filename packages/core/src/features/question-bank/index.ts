import path from "node:path";
import type { SliceMigrations } from "../../shared/storage/index.ts";

export { questionBankModule } from "./module.ts";
export type { QuestionBank } from "./application/question-bank.ts";
export const questionBankMigrations: SliceMigrations = {
  schema: "question_bank",
  folder: path.join(import.meta.dirname, "infrastructure", "migrations"),
};

export { searchQuestions } from "./application/search-questions.ts";

export { demoTarget, demoQuestions } from "./domain/demo-data.ts";
