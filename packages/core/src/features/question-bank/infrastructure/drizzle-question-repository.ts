import { and, asc, count, eq, inArray, sql } from "drizzle-orm";

import { executorOf } from "../../../shared/storage/index.ts";
import type { Database, Executor, Transaction } from "../../../shared/storage/index.ts";
import type { QuestionFilter, QuestionRepository } from "../domain/ports.ts";
import type { Question } from "../domain/question.ts";
import { questions, topics } from "./schema.ts";
import { setupWrites, toQuestion } from "./setup-writes.ts";

async function search(
  database: Database,
  targetId: string,
  filter: QuestionFilter,
): Promise<readonly Question[]> {
  if (filter.topicIds?.length === 0) {
    return [];
  }
  const words = filter.text?.trim().split(/\s+/u).filter(Boolean) ?? [];
  const conditions = [
    eq(questions.targetId, targetId),
    eq(questions.hidden, filter.hidden ?? false),
    filter.topicId === undefined ? undefined : eq(questions.topicId, filter.topicId),
    filter.topicIds === undefined ? undefined : inArray(questions.topicId, [...filter.topicIds]),
    // strpos treats %, _ and backslash as literal text rather than LIKE wildcards.
    ...words.map((word) => sql`strpos(lower(${questions.text}), lower(${word})) > 0`),
  ];
  const query = database
    .select()
    .from(questions)
    .where(and(...conditions))
    .orderBy(asc(questions.id));
  const rows = filter.limit === undefined ? await query : await query.limit(filter.limit);
  return rows.map((row) => toQuestion(row));
}

async function topicSummaries(executor: Executor, targetId: string) {
  return executor
    .select({
      id: topics.id,
      targetId: topics.targetId,
      name: topics.name,
      questionCount: count(questions.id),
    })
    .from(topics)
    .leftJoin(questions, eq(topics.id, questions.topicId))
    .where(eq(topics.targetId, targetId))
    .groupBy(topics.id)
    .orderBy(asc(topics.name));
}

export function drizzleQuestionRepository(database: Database): QuestionRepository<Transaction> {
  return {
    seed: async (newTopics, newQuestions) => {
      await database.transaction(async (transaction) => {
        if (newTopics.length > 0) {
          await transaction.insert(topics).values([...newTopics]);
        }
        if (newQuestions.length > 0) {
          await transaction.insert(questions).values(
            newQuestions.map((question) => ({
              ...question,
              createdAt: new Date(question.createdAt),
            })),
          );
        }
      });
    },
    addTopics: async (newTopics, transaction) => {
      await executorOf(database, transaction)
        .insert(topics)
        .values([...newTopics]);
    },
    topics: async (targetId, transaction) =>
      topicSummaries(executorOf(database, transaction), targetId),
    search: async (targetId, filter) => search(database, targetId, filter),
    rate: async (id, rating) => {
      const rows = await database
        .update(questions)
        .set({ rating })
        .where(eq(questions.id, id))
        .returning({ id: questions.id });
      return rows.length > 0;
    },
    ...setupWrites(database),
    hide: async (id, hidden) => {
      const rows = await database
        .update(questions)
        .set({ hidden })
        .where(eq(questions.id, id))
        .returning({ id: questions.id });
      return rows.length > 0;
    },
  };
}
