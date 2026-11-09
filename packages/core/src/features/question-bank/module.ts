import type { Database } from "../../shared/storage/index.ts";
import { createQuestionBank } from "./application/question-bank.ts";
import { drizzleQuestionRepository } from "./infrastructure/drizzle-question-repository.ts";

export function questionBankModule({ database }: { database: Database }) {
  return createQuestionBank(drizzleQuestionRepository(database));
}
