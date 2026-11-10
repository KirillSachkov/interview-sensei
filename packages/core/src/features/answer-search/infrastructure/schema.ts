import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgSchema,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import type { FailedQuestion, RunStatus, SavedAnswer } from "../domain/answer-run.ts";

export const answerSearchSchema = pgSchema("answer_search");

/** The answer search runs; a Target has at most one that waits or runs. */
export const answerRuns = answerSearchSchema.table(
  "answer_runs",
  {
    id: uuid("id").primaryKey(),
    targetId: uuid("target_id").notNull(),
    sessionId: uuid("session_id"),
    status: text("status").$type<RunStatus>().notNull(),
    requested: integer("requested").notNull(),
    queueIds: jsonb("queue_ids")
      .$type<readonly string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    handedIds: jsonb("handed_ids")
      .$type<readonly string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    saved: jsonb("saved")
      .$type<readonly SavedAnswer[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    startedAt: timestamp("started_at", { withTimezone: true, mode: "date" }).notNull(),
    finishedAt: timestamp("finished_at", { withTimezone: true, mode: "date" }),
  },
  (table) => [
    uniqueIndex("answer_runs_one_active")
      .on(table.targetId)
      .where(sql`${table.status} <> 'finished'`),
  ],
);

/** The answer reports of each Target. */
export const answerReports = answerSearchSchema.table(
  "answer_reports",
  {
    id: uuid("id").primaryKey(),
    number: integer("number").generatedAlwaysAsIdentity().notNull(),
    targetId: uuid("target_id").notNull(),
    runId: uuid("run_id").notNull(),
    sessionId: uuid("session_id"),
    total: integer("total").notNull(),
    filled: jsonb("filled").$type<readonly SavedAnswer[]>().notNull(),
    failed: jsonb("failed").$type<readonly FailedQuestion[]>().notNull(),
    summary: text("summary").notNull(),
    partial: boolean("partial").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull(),
  },
  (table) => [index("answer_reports_by_target").on(table.targetId, table.number)],
);
