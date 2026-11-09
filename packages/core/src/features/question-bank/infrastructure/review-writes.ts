// The writes of the Candidate's review of Questions: a bulk review and «просмотрено».
import { and, eq, inArray } from "drizzle-orm";

import type { Database, Transaction } from "../../../shared/storage/index.ts";
import type { QuestionRepository } from "../domain/ports.ts";
import { questions } from "./schema.ts";

export function reviewWrites(
  database: Database,
): Pick<QuestionRepository<Transaction>, "review" | "markSeen"> {
  return {
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
