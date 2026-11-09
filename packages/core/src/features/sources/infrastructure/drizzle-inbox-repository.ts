import { and, desc, eq, sql } from "drizzle-orm";

import { executorOf } from "../../../shared/storage/index.ts";
import type { Database, Transaction } from "../../../shared/storage/index.ts";
import type { InboxProposal, InboxReport, InboxRun } from "../domain/inbox.ts";
import type { InboxRepository } from "../domain/ports.ts";
import { inboxProposals, inboxReports, inboxRuns } from "./schema.ts";

function toProposal(row: typeof inboxProposals.$inferSelect): InboxProposal {
  return { ...row, createdAt: row.createdAt.toISOString() };
}

function toRun(row: typeof inboxRuns.$inferSelect): InboxRun {
  return {
    ...row,
    startedAt: row.startedAt.toISOString(),
    finishedAt: row.finishedAt?.toISOString() ?? null,
  };
}

function toReport({ number: _number, ...row }: typeof inboxReports.$inferSelect): InboxReport {
  return { ...row, createdAt: row.createdAt.toISOString() };
}

const open = (targetId: string) =>
  and(eq(inboxProposals.targetId, targetId), eq(inboxProposals.status, "open"));

const running = (targetId: string) =>
  and(eq(inboxRuns.targetId, targetId), eq(inboxRuns.status, "running"));

type Repository = InboxRepository<Transaction>;

function proposalQueries(
  database: Database,
): Pick<Repository, "saveProposal" | "openProposal" | "closeProposal"> {
  return {
    saveProposal: async (proposal) => {
      await database.transaction(async (transaction) => {
        await transaction
          .update(inboxProposals)
          .set({ status: "dismissed" })
          .where(open(proposal.targetId));
        await transaction
          .insert(inboxProposals)
          .values({ ...proposal, createdAt: new Date(proposal.createdAt) });
      });
    },
    openProposal: async (targetId) => {
      const [row] = await database
        .select()
        .from(inboxProposals)
        .where(open(targetId))
        .orderBy(desc(inboxProposals.createdAt));
      return row === undefined ? undefined : toProposal(row);
    },
    closeProposal: async (targetId, status, transaction) => {
      const rows = await executorOf(database, transaction)
        .update(inboxProposals)
        .set({ status })
        .where(open(targetId))
        .returning({ id: inboxProposals.id });
      return rows.length > 0;
    },
  };
}

function runQueries(
  database: Database,
): Pick<Repository, "createRun" | "runningRun" | "setRunSession" | "finishRun"> {
  return {
    createRun: async (run, transaction) => {
      const rows = await transaction
        .insert(inboxRuns)
        .values({
          ...run,
          startedAt: new Date(run.startedAt),
          finishedAt: run.finishedAt === null ? null : new Date(run.finishedAt),
        })
        .onConflictDoNothing()
        .returning({ id: inboxRuns.id });
      return rows.length > 0 ? "created" : "running";
    },
    runningRun: async (targetId, transaction) => {
      const [row] = await executorOf(database, transaction)
        .select()
        .from(inboxRuns)
        .where(running(targetId));
      return row === undefined ? undefined : toRun(row);
    },
    setRunSession: async (runId, sessionId) => {
      const rows = await database
        .update(inboxRuns)
        .set({ sessionId })
        .where(and(eq(inboxRuns.id, runId), eq(inboxRuns.status, "running")))
        .returning({ id: inboxRuns.id });
      return rows.length > 0;
    },
    finishRun: async (runId, finishedAt, transaction) => {
      await transaction
        .update(inboxRuns)
        .set({ status: "finished", finishedAt: new Date(finishedAt) })
        .where(eq(inboxRuns.id, runId));
    },
  };
}

/** Every running run, and what a run's agent read and added. */
function progressQueries(
  database: Database,
): Pick<Repository, "allRunning" | "recordRead" | "recordAdded"> {
  return {
    allRunning: async () => {
      const rows = await database.select().from(inboxRuns).where(eq(inboxRuns.status, "running"));
      return rows.map((row) => toRun(row));
    },
    recordRead: async (runId, { sourceId, part }) => {
      const read = sql`coalesce(${inboxRuns.readParts} -> ${sourceId}::text, '[]'::jsonb)`;
      await database
        .update(inboxRuns)
        .set({
          readParts: sql`jsonb_set(${inboxRuns.readParts}, array[${sourceId}::text], ${read} || ${JSON.stringify([part])}::jsonb)`,
        })
        .where(eq(inboxRuns.id, runId));
    },
    recordAdded: async (runId, { questionIds, duplicates }, transaction) => {
      await transaction
        .update(inboxRuns)
        .set({
          questionIds: sql`${inboxRuns.questionIds} || ${JSON.stringify(questionIds)}::jsonb`,
          duplicates: sql`${inboxRuns.duplicates} + ${duplicates}`,
        })
        .where(eq(inboxRuns.id, runId));
    },
  };
}

function reportQueries(
  database: Database,
): Pick<Repository, "addReport" | "report" | "latestReport"> {
  return {
    addReport: async (report, transaction) => {
      await transaction
        .insert(inboxReports)
        .values({ ...report, createdAt: new Date(report.createdAt) });
    },
    report: async (targetId, id) => {
      const [row] = await database
        .select()
        .from(inboxReports)
        .where(and(eq(inboxReports.targetId, targetId), eq(inboxReports.id, id)));
      return row === undefined ? undefined : toReport(row);
    },
    latestReport: async (targetId) => {
      const [row] = await database
        .select()
        .from(inboxReports)
        .where(eq(inboxReports.targetId, targetId))
        .orderBy(desc(inboxReports.number))
        .limit(1);
      return row === undefined ? undefined : toReport(row);
    },
  };
}

/** The proposals, runs and reports of Inbox processing in the `sources` Postgres schema. */
export function drizzleInboxRepository(database: Database): Repository {
  return {
    ...proposalQueries(database),
    ...runQueries(database),
    ...progressQueries(database),
    ...reportQueries(database),
    erase: async (targetId, transaction) => {
      await transaction.delete(inboxReports).where(eq(inboxReports.targetId, targetId));
      await transaction.delete(inboxRuns).where(eq(inboxRuns.targetId, targetId));
      await transaction.delete(inboxProposals).where(eq(inboxProposals.targetId, targetId));
    },
  };
}
