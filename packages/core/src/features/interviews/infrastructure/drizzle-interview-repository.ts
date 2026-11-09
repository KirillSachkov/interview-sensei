import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import type { SQL } from "drizzle-orm";

import type { Database, Executor, Transaction } from "../../../shared/storage/index.ts";
import type {
  AskedQuestion,
  Attempt,
  CandidateAnswer,
  FollowUp,
  MockInterview,
  PastQuestion,
} from "../domain/interview.ts";
import type {
  InterviewErasure,
  InterviewQuestionAttempts,
  InterviewRepository,
  InterviewTopicMerge,
} from "../domain/ports.ts";
import { drizzleHistoryQueries } from "./drizzle-history-queries.ts";
import { drizzleSideThreadQueries } from "./drizzle-side-thread-queries.ts";
import { toAttempt, toGrade, toInterview } from "./rows.ts";
import { askedQuestions, attempts, disputes, interviews, sideThreads } from "./schema.ts";

const date = (moment: string | undefined) => (moment === undefined ? undefined : new Date(moment));

function toAsked(row: typeof askedQuestions.$inferSelect): AskedQuestion {
  return { ...row, presentedAt: row.presentedAt.toISOString() };
}

async function oneInterview(database: Database, condition: SQL | undefined) {
  const [row] = await database.select().from(interviews).where(condition);
  return row === undefined ? undefined : toInterview(row);
}

/** The Mock interviews themselves. */
function interviewQueries(database: Database) {
  return {
    create: async (interview: MockInterview) => {
      const rows = await database
        .insert(interviews)
        .values({
          ...interview,
          startedAt: new Date(interview.startedAt),
          finishRequestedAt: null,
          finishedAt: null,
        })
        // The only conflict a new id can meet: the Target's running Mock interview.
        .onConflictDoNothing()
        .returning({ id: interviews.id });
      return rows.length > 0 ? ("created" as const) : ("running" as const);
    },
    get: async (id: string) => oneInterview(database, eq(interviews.id, id)),
    bySession: async (sessionId: string) =>
      oneInterview(database, eq(interviews.sessionId, sessionId)),
    running: async (targetId: string) =>
      oneInterview(
        database,
        and(eq(interviews.targetId, targetId), eq(interviews.status, "running")),
      ),
    latest: async (targetId: string, limit: number) => {
      const rows = await database
        .select()
        .from(interviews)
        .where(eq(interviews.targetId, targetId))
        .orderBy(desc(interviews.startedAt), desc(interviews.id))
        .limit(limit);
      return rows.map((row) => toInterview(row));
    },
  } satisfies Partial<InterviewRepository>;
}

/** The questions the agent showed and the Candidate's answers to them. */
function askedQueries(database: Database) {
  return {
    asked: async (interviewId: string) => {
      const rows = await database
        .select()
        .from(askedQuestions)
        .where(eq(askedQuestions.interviewId, interviewId))
        .orderBy(asc(askedQuestions.position));
      return rows.map((row) => toAsked(row));
    },
    ask: async (question: AskedQuestion) => {
      await database
        .insert(askedQuestions)
        .values({ ...question, presentedAt: new Date(question.presentedAt) });
    },
    answer: async (askedQuestionId: string, answer: CandidateAnswer) => {
      await database
        .update(askedQuestions)
        .set({ answer })
        .where(eq(askedQuestions.id, askedQuestionId));
    },
    followUps: async (askedQuestionId: string, followUps: readonly FollowUp[]) => {
      await database
        .update(askedQuestions)
        .set({ followUps })
        .where(eq(askedQuestions.id, askedQuestionId));
    },
  } satisfies Partial<InterviewRepository>;
}

/** The Grade that applies to the Attempt: its latest Dispute's, or the recorded one. */
const correctedGrade = sql<number | null>`coalesce((
  select ${disputes.grade} from ${disputes} where ${disputes.attemptId} = ${attempts.id}
  order by ${disputes.disputedAt} desc, ${disputes.sequence} desc limit 1
), ${attempts.grade})`;

/** Every Question asked in a Target's Mock interviews, with the corrected Grade of its Attempt. */
async function history(database: Database, targetId: string): Promise<readonly PastQuestion[]> {
  const rows = await database
    .select({
      interviewId: askedQuestions.interviewId,
      questionId: askedQuestions.questionId,
      topicId: askedQuestions.topicId,
      presentedAt: askedQuestions.presentedAt,
      grade: correctedGrade,
    })
    .from(askedQuestions)
    .innerJoin(interviews, eq(askedQuestions.interviewId, interviews.id))
    .leftJoin(attempts, eq(attempts.askedQuestionId, askedQuestions.id))
    .where(eq(interviews.targetId, targetId))
    .orderBy(
      asc(askedQuestions.presentedAt),
      asc(interviews.startedAt),
      asc(askedQuestions.position),
    );
  return rows.map(({ interviewId, questionId, topicId, presentedAt, grade }) => ({
    interviewId,
    questionId,
    topicId,
    presentedAt: presentedAt.toISOString(),
    grade: grade === null ? null : toGrade(grade),
  }));
}

/** The Attempts; one per asked question. */
function attemptQueries(database: Database) {
  return {
    attempts: async (interviewId: string) => {
      const rows = await database
        .select()
        .from(attempts)
        .where(eq(attempts.interviewId, interviewId))
        .orderBy(asc(attempts.recordedAt), asc(attempts.id));
      return rows.map((row) => toAttempt(row));
    },
    record: async (attempt: Attempt) => {
      const rows = await database
        .insert(attempts)
        .values({ ...attempt, recordedAt: new Date(attempt.recordedAt) })
        .onConflictDoNothing({ target: attempts.askedQuestionId })
        .returning({ id: attempts.id });
      return rows.length > 0 ? ("recorded" as const) : ("exists" as const);
    },
  } satisfies Partial<InterviewRepository>;
}

/**
 * The Disputes and Side threads go first, then the Attempts and the asked questions: each
 * references the next.
 */
async function eraseTarget(executor: Executor, targetId: string): Promise<void> {
  const owned = executor
    .select({ id: interviews.id })
    .from(interviews)
    .where(eq(interviews.targetId, targetId));
  await executor.delete(disputes).where(inArray(disputes.interviewId, owned));
  await executor.delete(sideThreads).where(inArray(sideThreads.interviewId, owned));
  await executor.delete(attempts).where(inArray(attempts.interviewId, owned));
  await executor.delete(askedQuestions).where(inArray(askedQuestions.interviewId, owned));
  await executor.delete(interviews).where(eq(interviews.targetId, targetId));
}

/** The questions asked in the Target's Mock interviews on the Topic `from` move to `into`. */
async function mergeTopic(
  executor: Executor,
  targetId: string,
  { from, into }: { readonly from: string; readonly into: string },
): Promise<void> {
  const owned = executor
    .select({ id: interviews.id })
    .from(interviews)
    .where(eq(interviews.targetId, targetId));
  await executor
    .update(askedQuestions)
    .set({ topicId: into })
    .where(and(inArray(askedQuestions.interviewId, owned), eq(askedQuestions.topicId, from)));
}

/** The Questions among `questionIds` that have an Attempt in the Target's Mock interviews. */
async function attempted(database: Database, targetId: string, questionIds: readonly string[]) {
  if (questionIds.length === 0) {
    return [];
  }
  const rows = await database
    .selectDistinct({ questionId: askedQuestions.questionId })
    .from(attempts)
    .innerJoin(askedQuestions, eq(askedQuestions.id, attempts.askedQuestionId))
    .innerJoin(interviews, eq(interviews.id, attempts.interviewId))
    .where(
      and(eq(interviews.targetId, targetId), inArray(askedQuestions.questionId, [...questionIds])),
    );
  return rows.map((row) => row.questionId);
}

export function drizzleInterviewRepository(
  database: Database,
): InterviewRepository &
  InterviewErasure<Transaction> &
  InterviewTopicMerge<Transaction> &
  InterviewQuestionAttempts {
  return {
    ...interviewQueries(database),
    update: async (id, { finishRequestedAt, finishedAt, ...changes }) => {
      await database
        .update(interviews)
        .set({
          ...changes,
          ...(finishRequestedAt === undefined
            ? {}
            : { finishRequestedAt: date(finishRequestedAt) }),
          ...(finishedAt === undefined ? {} : { finishedAt: date(finishedAt) }),
        })
        .where(eq(interviews.id, id));
    },
    ...askedQueries(database),
    ...attemptQueries(database),
    history: async (targetId) => history(database, targetId),
    ...drizzleHistoryQueries(database),
    ...drizzleSideThreadQueries(database),
    eraseTarget: async (targetId, transaction) => eraseTarget(transaction, targetId),
    mergeTopic: async (targetId, topics, transaction) => mergeTopic(transaction, targetId, topics),
    attempted: async (targetId, questionIds) => attempted(database, targetId, questionIds),
  };
}
