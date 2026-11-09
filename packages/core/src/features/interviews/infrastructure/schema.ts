import { sql } from "drizzle-orm";
import {
  boolean,
  integer,
  jsonb,
  pgSchema,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import type { Dispute } from "../domain/dispute.ts";
import type {
  AskedQuestion,
  CandidateAnswer,
  Difficulty,
  FollowUp,
  InterviewStatus,
} from "../domain/interview.ts";

/** The Postgres schema that the interviews slice owns. */
export const interviewsSchema = pgSchema("interviews");

const moment = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });

/** One Mock interview. A Target has at most one running Mock interview. */
export const interviews = interviewsSchema.table(
  "interviews",
  {
    id: uuid("id").primaryKey(),
    targetId: uuid("target_id").notNull(),
    sessionId: uuid("session_id").notNull(),
    agent: text("agent").notNull(),
    status: text("status").$type<InterviewStatus>().notNull(),
    sectionIds: jsonb("section_ids").$type<readonly string[]>().notNull(),
    currentSectionId: uuid("current_section_id"),
    limitMinutes: integer("limit_minutes"),
    difficulty: text("difficulty").$type<Difficulty>().notNull(),
    startedAt: moment("started_at").notNull(),
    finishRequestedAt: moment("finish_requested_at"),
    finishedAt: moment("finished_at"),
    summary: text("summary"),
    nextStep: text("next_step"),
  },
  (table) => [
    uniqueIndex("one_running_interview")
      .on(table.targetId)
      .where(sql`${table.status} = 'running'`),
    unique().on(table.sessionId),
  ],
);

/** The questions the agent showed in a Mock interview, with the Candidate's answers. */
export const askedQuestions = interviewsSchema.table(
  "asked_questions",
  {
    id: uuid("id").primaryKey(),
    interviewId: uuid("interview_id")
      .notNull()
      .references(() => interviews.id),
    position: integer("position").notNull(),
    questionId: uuid("question_id").notNull(),
    topicId: uuid("topic_id").notNull(),
    sectionId: uuid("section_id").notNull(),
    text: text("text").notNull(),
    format: text("format").$type<AskedQuestion["format"]>().notNull(),
    options: jsonb("options").$type<AskedQuestion["options"]>().notNull(),
    correctOptionIds: jsonb("correct_option_ids").$type<readonly string[]>().notNull(),
    parentAttemptId: uuid("parent_attempt_id"),
    presentedAt: moment("presented_at").notNull(),
    answer: jsonb("answer").$type<CandidateAnswer>(),
    followUps: jsonb("follow_ups")
      .$type<readonly FollowUp[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
  },
  (table) => [unique().on(table.interviewId, table.position)],
);

/** The Attempts; one per asked question, never changed after it is recorded. */
export const attempts = interviewsSchema.table("attempts", {
  id: uuid("id").primaryKey(),
  interviewId: uuid("interview_id")
    .notNull()
    .references(() => interviews.id),
  askedQuestionId: uuid("asked_question_id")
    .notNull()
    .unique()
    .references(() => askedQuestions.id),
  grade: integer("grade").notNull(),
  gradedBy: text("graded_by").$type<"agent" | "quiz">().notNull(),
  gaps: text("gaps").notNull(),
  justification: text("justification").notNull(),
  strongAnswer: text("strong_answer").notNull(),
  hinted: boolean("hinted").notNull().default(false),
  recordedAt: moment("recorded_at").notNull(),
});

/** The Candidate's Disputes of Grades; the latest one of an Attempt applies. */
export const disputes = interviewsSchema.table("disputes", {
  id: uuid("id").primaryKey(),
  /** The order the Disputes were made in, for Disputes at the same moment. */
  sequence: integer("sequence").notNull().generatedAlwaysAsIdentity(),
  interviewId: uuid("interview_id")
    .notNull()
    .references(() => interviews.id),
  attemptId: uuid("attempt_id")
    .notNull()
    .references(() => attempts.id),
  grade: integer("grade").$type<Dispute["grade"]>().notNull(),
  reason: text("reason").notNull(),
  disputedAt: moment("disputed_at").notNull(),
});
