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

import type {
  DoubtfulQuestion,
  InboxMode,
  InboxProposal,
  InboxRun,
  ProposalItem,
  ReportProposals,
} from "../domain/inbox.ts";
import type { SourceStatus, SourceType } from "../domain/source.ts";

export const sourcesSchema = pgSchema("sources");
/** The Sources of each Target, in the order of `number`. */
export const sources = sourcesSchema.table(
  "sources",
  {
    id: uuid("id").primaryKey(),
    number: integer("number").generatedAlwaysAsIdentity().notNull(),
    targetId: uuid("target_id").notNull(),
    type: text("type").$type<SourceType>().notNull(),
    title: text("title").notNull(),
    file: text("file"),
    url: text("url"),
    status: text("status").$type<SourceStatus>().notNull(),
    failure: text("failure"),
    parts: integer("parts"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull(),
  },
  (table) => [index("sources_by_target").on(table.targetId, table.number)],
);

/** The proposals of Inbox processing that the setup agent showed in the chat. */
export const inboxProposals = sourcesSchema.table(
  "inbox_proposals",
  {
    id: uuid("id").primaryKey(),
    targetId: uuid("target_id").notNull(),
    mode: text("mode").$type<InboxMode>().notNull().default("processing"),
    items: jsonb("items").$type<readonly ProposalItem[]>().notNull(),
    reason: text("reason"),
    status: text("status").$type<InboxProposal["status"]>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull(),
  },
  (table) => [index("inbox_proposals_by_target").on(table.targetId, table.status)],
);

/** The Inbox processing runs; a Target has at most one running run. */
export const inboxRuns = sourcesSchema.table(
  "inbox_runs",
  {
    id: uuid("id").primaryKey(),
    targetId: uuid("target_id").notNull(),
    sessionId: uuid("session_id"),
    mode: text("mode").$type<InboxMode>().notNull(),
    status: text("status").$type<InboxRun["status"]>().notNull(),
    sourceIds: jsonb("source_ids").$type<readonly string[]>().notNull(),
    questionIds: jsonb("question_ids")
      .$type<readonly string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    duplicates: integer("duplicates").notNull().default(0),
    startedAt: timestamp("started_at", { withTimezone: true, mode: "date" }).notNull(),
    finishedAt: timestamp("finished_at", { withTimezone: true, mode: "date" }),
  },
  (table) => [
    uniqueIndex("inbox_runs_one_running")
      .on(table.targetId)
      .where(sql`${table.status} = 'running'`),
  ],
);

/** The Inbox reports of each Target. */
export const inboxReports = sourcesSchema.table(
  "inbox_reports",
  {
    id: uuid("id").primaryKey(),
    number: integer("number").generatedAlwaysAsIdentity().notNull(),
    targetId: uuid("target_id").notNull(),
    runId: uuid("run_id").notNull(),
    mode: text("mode").$type<InboxMode>().notNull(),
    sourceIds: jsonb("source_ids").$type<readonly string[]>().notNull(),
    questionIds: jsonb("question_ids").$type<readonly string[]>().notNull(),
    duplicates: integer("duplicates").notNull(),
    summary: text("summary").notNull(),
    doubtful: jsonb("doubtful").$type<readonly DoubtfulQuestion[]>().notNull(),
    // A report written before the recheck existed has no list «скрыть?».
    proposals: jsonb("proposals")
      .$type<Omit<ReportProposals, "hide"> & Partial<Pick<ReportProposals, "hide">>>()
      .notNull(),
    partial: boolean("partial").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull(),
  },
  (table) => [index("inbox_reports_by_target").on(table.targetId, table.number)],
);
