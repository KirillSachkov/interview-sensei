// The Candidate's review of Questions: a bulk review, «просмотрено», and one Question to check.
import { and, eq, inArray } from "drizzle-orm";

import { executorOf } from "../../../shared/storage/index.ts";
import type { Database, Transaction } from "../../../shared/storage/index.ts";
import type { QuestionRepository } from "../domain/ports.ts";
import { questions } from "./schema.ts";
import { toQuestion } from "./setup-writes.ts";

export function reviewWrites(
  database: Database,
): Pick<QuestionRepository<Transaction>, "review" | "markSeen" | "question"> {
  return {
    question: async (id, transaction) => {
      const [row] = await executorOf(database, transaction)
        .select()
        .from(questions)
        .where(eq(questions.id, id));
      return row === undefined ? undefined : toQuestion(row);
    },
    review: async (targetId, { deleted, edits }) => {
      await database.transaction(async (transaction) => {
        if (deleted.length > 0) {
          await transaction
            .delete(questions)
            .where(and(eq(questions.targetId, targetId), inArray(questions.id, [...deleted])));
        }
        for (const { id, ...fields } of edits) {
          // oxlint-disable-next-line eslint/no-await-in-loop -- the edits share one transaction
          await transaction
            .update(questions)
            .set(fields)
            .where(and(eq(questions.targetId, targetId), eq(questions.id, id)));
        }
      });
    },
    markSeen: async (targetId, ids) => {
      if (ids.length === 0) {
        return;
      }
      await database
        .update(questions)
        .set({ unseen: false })
        .where(and(eq(questions.targetId, targetId), inArray(questions.id, [...ids])));
    },
  };
}
