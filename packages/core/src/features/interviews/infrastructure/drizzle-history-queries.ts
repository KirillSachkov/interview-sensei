import { and, asc, desc, eq, gte, lt, sql } from "drizzle-orm";

import type { Database } from "../../../shared/storage/index.ts";
import type { Dispute } from "../domain/dispute.ts";
import type { AttemptRecord, HistoryFilter } from "../domain/history.ts";
import type { Grade, MockInterview } from "../domain/interview.ts";
import type { HistoryRepository } from "../domain/ports.ts";
import { askedQuestions, attempts, disputes, interviews } from "./schema.ts";

function toGrade(grade: number): Grade {
  if (grade === 0 || grade === 1 || grade === 2 || grade === 3) {
    return grade;
  }
  throw new Error(`A stored Grade is out of range: ${grade}`);
}

function toInterview(row: typeof interviews.$inferSelect): MockInterview {
  return {
    ...row,
    startedAt: row.startedAt.toISOString(),
    finishRequestedAt: row.finishRequestedAt?.toISOString() ?? null,
    finishedAt: row.finishedAt?.toISOString() ?? null,
  };
}

function toDispute({ sequence: _order, ...row }: typeof disputes.$inferSelect): Dispute {
  return { ...row, grade: toGrade(row.grade), disputedAt: row.disputedAt.toISOString() };
}

function historyCondition(targetId: string, { from, to, sectionId }: HistoryFilter) {
  return and(
    eq(interviews.targetId, targetId),
    from === undefined ? undefined : gte(interviews.startedAt, new Date(from)),
    to === undefined ? undefined : lt(interviews.startedAt, new Date(to)),
    sectionId === undefined
      ? undefined
      : sql`${interviews.sectionIds} @> ${JSON.stringify([sectionId])}::jsonb`,
  );
}

async function targetAttempts(database: Database, targetId: string) {
  const rows = await database
    .select({
      attempt: attempts,
      topicId: askedQuestions.topicId,
      text: askedQuestions.text,
      parentAttemptId: askedQuestions.parentAttemptId,
    })
    .from(attempts)
    .innerJoin(askedQuestions, eq(askedQuestions.id, attempts.askedQuestionId))
    .innerJoin(interviews, eq(interviews.id, attempts.interviewId))
    .where(eq(interviews.targetId, targetId))
    .orderBy(asc(attempts.recordedAt), asc(interviews.startedAt), asc(askedQuestions.position));
  return rows.map(({ attempt, ...question }): AttemptRecord => ({
    attempt: {
      ...attempt,
      grade: toGrade(attempt.grade),
      recordedAt: attempt.recordedAt.toISOString(),
    },
    question,
  }));
}

async function targetDisputes(database: Database, targetId: string) {
  const rows = await database
    .select({ dispute: disputes })
    .from(disputes)
    .innerJoin(interviews, eq(interviews.id, disputes.interviewId))
    .where(eq(interviews.targetId, targetId))
    .orderBy(asc(disputes.disputedAt), asc(disputes.sequence));
  return rows.map(({ dispute }) => toDispute(dispute));
}

/** The queries of the session history, progress and Disputes. */
export function drizzleHistoryQueries(database: Database): HistoryRepository {
  return {
    allRunning: async () => {
      const rows = await database.select().from(interviews).where(eq(interviews.status, "running"));
      return rows.map((row) => toInterview(row));
    },
    historyPage: async (targetId, filter, { offset, limit }) => {
      const condition = historyCondition(targetId, filter);
      const [rows, total] = await Promise.all([
        database
          .select()
          .from(interviews)
          .where(condition)
          .orderBy(desc(interviews.startedAt), desc(interviews.id))
          .offset(offset)
          .limit(limit),
        database.$count(interviews, condition),
      ]);
      return { interviews: rows.map((row) => toInterview(row)), total };
    },
    targetAttempts: async (targetId) => targetAttempts(database, targetId),
    dispute: async (dispute) => {
      await database
        .insert(disputes)
        .values({ ...dispute, disputedAt: new Date(dispute.disputedAt) });
    },
    disputes: async (interviewId) => {
      const rows = await database
        .select()
        .from(disputes)
        .where(eq(disputes.interviewId, interviewId))
        .orderBy(asc(disputes.disputedAt), asc(disputes.sequence));
      return rows.map((row) => toDispute(row));
    },
    targetDisputes: async (targetId) => targetDisputes(database, targetId),
  };
}
