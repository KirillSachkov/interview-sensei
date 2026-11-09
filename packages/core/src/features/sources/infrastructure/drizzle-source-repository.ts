import { and, asc, eq, inArray } from "drizzle-orm";

import { executorOf } from "../../../shared/storage/index.ts";
import type { Database, Transaction } from "../../../shared/storage/index.ts";
import type { SourceRepository } from "../domain/ports.ts";
import type { Source } from "../domain/source.ts";
import { sources } from "./schema.ts";

function toSource({ number: _number, ...row }: typeof sources.$inferSelect): Source {
  return { ...row, createdAt: row.createdAt.toISOString() };
}

/** The Sources in the `sources` Postgres schema. */
export function drizzleSourceRepository(database: Database): SourceRepository<Transaction> {
  return {
    add: async (source) => {
      await database.insert(sources).values({ ...source, createdAt: new Date(source.createdAt) });
    },
    list: async (targetId, transaction) => {
      const rows = await executorOf(database, transaction)
        .select()
        .from(sources)
        .where(eq(sources.targetId, targetId))
        .orderBy(asc(sources.number));
      return rows.map((row) => toSource(row));
    },
    get: async (targetId, id) => {
      const [row] = await database
        .select()
        .from(sources)
        .where(and(eq(sources.targetId, targetId), eq(sources.id, id)));
      return row === undefined ? undefined : toSource(row);
    },
    setStatus: async (targetId, { ids, status, failure, from }, transaction) => {
      if (ids.length === 0) {
        return;
      }
      await executorOf(database, transaction)
        .update(sources)
        .set({ status, failure: status === "failed" ? (failure ?? null) : null })
        .where(
          and(
            eq(sources.targetId, targetId),
            inArray(sources.id, [...ids]),
            from === undefined ? undefined : eq(sources.status, from),
          ),
        );
    },
    setParts: async (targetId, id, parts) => {
      await database
        .update(sources)
        .set({ parts })
        .where(and(eq(sources.targetId, targetId), eq(sources.id, id)));
    },
    erase: async (targetId, transaction) => {
      await transaction.delete(sources).where(eq(sources.targetId, targetId));
    },
  };
}
