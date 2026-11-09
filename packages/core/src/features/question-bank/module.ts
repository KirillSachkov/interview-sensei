import type { Database } from "../../shared/storage/index.ts";
import { createQuestionBank } from "./application/question-bank.ts";
import type { QuestionAttempts } from "./domain/ports.ts";
import { drizzleQuestionRepository } from "./infrastructure/drizzle-question-repository.ts";

/**
 * The Topics and Questions of each Target. `attempts`, the interviews slice, tells which Questions
 * have Attempts: deleting one of them hides it instead.
 */
export function questionBankModule({
  database,
  attempts,
}: {
  database: Database;
  attempts: QuestionAttempts;
}) {
  return createQuestionBank(drizzleQuestionRepository(database), attempts);
}
