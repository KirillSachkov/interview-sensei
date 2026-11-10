import { and, desc, eq, isNull, ne } from "drizzle-orm";

import { executorOf } from "../../../shared/storage/index.ts";
import type { Database, Transaction } from "../../../shared/storage/index.ts";
import type { AnswerReport, AnswerRun } from "../domain/answer-run.ts";
import type { AnswerRepository } from "../domain/ports.ts";
import { answerReports, answerRuns } from "./schema.ts";

function toRun(row: typeof answerRuns.$inferSelect): AnswerRun {
  return {
    ...row,
    startedAt: row.startedAt.toISOString(),
    finishedAt: row.finishedAt?.toISOString() ?? null,
  };
}

function toReport({ number: _number, ...row }: typeof answerReports.$inferSelect): AnswerReport {
  return { ...row, createdAt: row.createdAt.toISOString() };
}

const active = ne(answerRuns.status, "finished");

type Repository = AnswerRepository<Transaction>;

function runQueries(
  database: Database,
): Pick<Repository, "createRun" | "activeRun" | "allActive" | "setSession"> {
  return {
    createRun: async (run, transaction) => {
      const rows = await transaction
        .insert(answerRuns)
        .values({
          ...run,
          startedAt: new Date(run.startedAt),
          finishedAt: run.finishedAt === null ? null : new Date(run.finishedAt),
        })
        .onConflictDoNothing()
        .returning({ id: answerRuns.id });
      return rows.length > 0 ? "created" : "active";
    },
    activeRun: async (targetId, transaction) => {
      const [row] = await executorOf(database, transaction)
        .select()
        .from(answerRuns)
        .where(and(eq(answerRuns.targetId, targetId), active));
      return row === undefined ? undefined : toRun(row);
    },
    allActive: async () => {
      const rows = await database.select().from(answerRuns).where(active);
      return rows.map((row) => toRun(row));
    },
    setSession: async (runId, sessionId) => {
      const rows = await database
        .update(answerRuns)
        .set({ sessionId })
        .where(and(eq(answerRuns.id, runId), eq(answerRuns.status, "running")))
        .returning({ id: answerRuns.id });
      return rows.length > 0;
    },
  };
}

/** Moves a run between `waiting` and `running`. */
function waitQueries(database: Database): Pick<Repository, "begin" | "wait"> {
  return {
    begin: async (runId, queueIds) => {
      const rows = await database
        .update(answerRuns)
        .set({ status: "running", queueIds })
        .where(and(eq(answerRuns.id, runId), eq(answerRuns.status, "waiting")))
        .returning({ id: answerRuns.id });
      return rows.length > 0;
    },
    wait: async (runId) => {
      const rows = await database
        .update(answerRuns)
        .set({ status: "waiting", queueIds: [] })
        .where(
          and(
            eq(answerRuns.id, runId),
            eq(answerRuns.status, "running"),
            isNull(answerRuns.sessionId),
          ),
        )
        .returning({ id: answerRuns.id });
      return rows.length > 0;
    },
  };
}

function reportQueries(
  database: Database,
): Pick<Repository, "addReport" | "report" | "latestReport"> {
  return {
    addReport: async (report, transaction) => {
      await transaction
        .insert(answerReports)
        .values({ ...report, createdAt: new Date(report.createdAt) });
    },
    report: async (targetId, id) => {
      const [row] = await database
        .select()
        .from(answerReports)
        .where(and(eq(answerReports.targetId, targetId), eq(answerReports.id, id)));
      return row === undefined ? undefined : toReport(row);
    },
    latestReport: async (targetId) => {
      const [row] = await database
        .select()
        .from(answerReports)
        .where(eq(answerReports.targetId, targetId))
        .orderBy(desc(answerReports.number))
        .limit(1);
      return row === undefined ? undefined : toReport(row);
    },
  };
}

export function drizzleAnswerRepository(database: Database): Repository {
  return {
    ...runQueries(database),
    ...waitQueries(database),
    ...reportQueries(database),
    setHanded: async (runId, handedIds, transaction) => {
      await transaction.update(answerRuns).set({ handedIds }).where(eq(answerRuns.id, runId));
    },
    setSaved: async (runId, saved, transaction) => {
      await transaction.update(answerRuns).set({ saved }).where(eq(answerRuns.id, runId));
    },
    finishRun: async (runId, finishedAt, transaction) => {
      await transaction
        .update(answerRuns)
        .set({ status: "finished", finishedAt: new Date(finishedAt) })
        .where(eq(answerRuns.id, runId));
    },
    erase: async (targetId, transaction) => {
      await transaction.delete(answerReports).where(eq(answerReports.targetId, targetId));
      await transaction.delete(answerRuns).where(eq(answerRuns.targetId, targetId));
    },
  };
}
