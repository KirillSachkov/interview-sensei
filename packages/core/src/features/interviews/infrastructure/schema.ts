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
import type { SideThreadOrigin } from "../domain/side-thread.ts";
import type {
  AskedQuestion,
  CandidateAnswer,
  Difficulty,
  FollowUp,
  GradedBy,
  InterviewStatus,
  PauseReason,
  ReferenceAnswer,
  ReferencePoint,
} from "../domain/interview.ts";

/** The Postgres schema that the interviews slice owns. */
export const interviewsSchema = pgSchema("interviews");

const moment = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });

/** One Mock interview. A Target has at most one Mock interview that runs or is paused. */
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
    pausedAt: moment("paused_at"),
    pausedMs: integer("paused_ms").notNull().default(0),
    pauseReason: text("pause_reason").$type<PauseReason>(),
    resumedAt: moment("resumed_at"),
    finishRequestedAt: moment("finish_requested_at"),
    finishedAt: moment("finished_at"),
    summary: text("summary"),
    nextStep: text("next_step"),
  },
  (table) => [
    uniqueIndex("one_active_interview")
      .on(table.targetId)
      .where(sql`${table.status} in ('running', 'paused')`),
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
    /** The Question's reference answer when shown (#64); null without one and before #64. */
    referenceAnswer: jsonb("reference_answer").$type<ReferenceAnswer>(),
    parentAttemptId: uuid("parent_attempt_id"),
    presentedAt: moment("presented_at").notNull(),
    answer: jsonb("answer").$type<CandidateAnswer>(),
    followUps: jsonb("follow_ups")
      .$type<readonly FollowUp[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    /** A Side thread opened before the answer: the Attempt is recorded as received with a hint. */
    hinted: boolean("hinted").notNull().default(false),
    /** The Candidate opened the Debrief: the Handoff brief may hold the Grade from then on. */
    debriefOpened: boolean("debrief_opened").notNull().default(false),
    /** How many entries the interviewer chat had when the question was shown; null before #80. */
    chatPosition: integer("chat_position"),
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
  gradedBy: text("graded_by").$type<GradedBy>().notNull(),
  gaps: text("gaps").notNull(),
  justification: text("justification").notNull(),
  strongAnswer: text("strong_answer").notNull(),
  hinted: boolean("hinted").notNull().default(false),
  /** The reference answer's key points with whether the answer covered them (#64). */
  referencePoints: jsonb("reference_points").$type<readonly ReferencePoint[]>(),
  /** Why the interviewer disagrees with the reference answer; null when it agrees. */
  referenceDisagreement: text("reference_disagreement"),
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

/**
 * The Side threads of Mock interviews. Deleting one removes its row and its AgentSession's journal;
 * the hint mark of its asked question stays.
 */
export const sideThreads = interviewsSchema.table("side_threads", {
  id: uuid("id").primaryKey(),
  interviewId: uuid("interview_id")
    .notNull()
    .references(() => interviews.id),
  sessionId: uuid("session_id").notNull().unique(),
  originKind: text("origin_kind").$type<SideThreadOrigin["kind"]>().notNull(),
  // Text: an agent message of the chat has an id of its journal entry, not a UUID.
  originId: text("origin_id").notNull(),
  askedQuestionId: uuid("asked_question_id")
    .notNull()
    .references(() => askedQuestions.id),
  fragment: text("fragment"),
  question: text("question"),
  hinted: boolean("hinted").notNull(),
  createdAt: moment("created_at").notNull(),
  /** When the server closed the Side thread for good; null while it may go on. */
  closedAt: moment("closed_at"),
  /** The order the Side threads were opened in, for Side threads opened at the same moment. */
  sequence: integer("sequence").notNull().generatedAlwaysAsIdentity(),
});
