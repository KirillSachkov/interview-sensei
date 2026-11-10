// The reads and writes of the Target setup's draft of changes: they run in its shared transaction.
import { and, asc, eq } from "drizzle-orm";

import { executorOf } from "../../../shared/storage/index.ts";
import type { Database, Transaction } from "../../../shared/storage/index.ts";
import type { QuestionRepository } from "../domain/ports.ts";
import type { Question, QuestionContent } from "../domain/question.ts";
import { questions, topics } from "./schema.ts";

export function toQuestion(row: typeof questions.$inferSelect): Question {
  const content: QuestionContent =
    row.format === "open"
      ? { format: "open", options: [], correctOptionIds: [] }
      : { format: "quiz", options: row.options, correctOptionIds: row.correctOptionIds };
  return { ...row, ...content, createdAt: row.createdAt.toISOString() };
}

export function setupWrites(
  database: Database,
): Pick<
  QuestionRepository<Transaction>,
  "questions" | "addQuestions" | "editQuestion" | "renameTopic" | "mergeTopic" | "setImportance"
> {
  return {
    questions: async (targetId, transaction) => {
      const rows = await executorOf(database, transaction)
        .select()
        .from(questions)
        .where(eq(questions.targetId, targetId))
        .orderBy(asc(questions.createdAt), asc(questions.id));
      return rows.map((row) => toQuestion(row));
    },
    addQuestions: async (added, transaction) => {
      await executorOf(database, transaction)
        .insert(questions)
        .values(
          added.map((question) => ({ ...question, createdAt: new Date(question.createdAt) })),
        );
    },
    editQuestion: async (targetId, { id, ...fields }, transaction) => {
      await executorOf(database, transaction)
        .update(questions)
        .set(fields)
        .where(and(eq(questions.targetId, targetId), eq(questions.id, id)));
    },
    renameTopic: async (topicId, name, transaction) => {
      await executorOf(database, transaction)
        .update(topics)
        .set({ name })
        .where(eq(topics.id, topicId));
    },
    setImportance: async (targetId, { topicId, importance }, transaction) => {
      await executorOf(database, transaction)
        .update(topics)
        .set({ importance })
        .where(and(eq(topics.targetId, targetId), eq(topics.id, topicId)));
    },
    mergeTopic: async (from, into, transaction) => {
      const executor = executorOf(database, transaction);
      await executor.update(questions).set({ topicId: into }).where(eq(questions.topicId, from));
      await executor.delete(topics).where(eq(topics.id, from));
    },
  };
}
