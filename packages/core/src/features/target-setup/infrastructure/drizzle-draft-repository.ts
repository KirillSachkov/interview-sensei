import { asc, eq } from "drizzle-orm";

import { executorOf } from "../../../shared/storage/index.ts";
import type { Database, Transaction } from "../../../shared/storage/index.ts";
import type { DraftChange } from "../domain/draft.ts";
import type { DraftRepository } from "../domain/ports.ts";
import { changes } from "./schema.ts";

function toChange(row: typeof changes.$inferSelect): DraftChange {
  return {
    id: row.id,
    targetId: row.targetId,
    operation: row.operation,
    createdAt: row.createdAt.toISOString(),
  };
}

/** The drafts of changes in the `target_setup` Postgres schema. */
export function drizzleDraftRepository(database: Database): DraftRepository<Transaction> {
  return {
    add: async (change) => {
      await database.insert(changes).values({ ...change, createdAt: new Date(change.createdAt) });
    },
    changes: async (targetId, transaction) => {
      const rows = await executorOf(database, transaction)
        .select()
        .from(changes)
        .where(eq(changes.targetId, targetId))
        .orderBy(asc(changes.number));
      return rows.map((row) => toChange(row));
    },
    clear: async (targetId, transaction) => {
      await transaction.delete(changes).where(eq(changes.targetId, targetId));
    },
  };
}
