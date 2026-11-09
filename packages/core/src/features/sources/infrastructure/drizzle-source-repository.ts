import { and, asc, eq } from "drizzle-orm";

import type { Database } from "../../../shared/storage/index.ts";
import type { SourceRepository } from "../domain/ports.ts";
import type { Source } from "../domain/source.ts";
import { sources } from "./schema.ts";

function toSource({ number: _number, ...row }: typeof sources.$inferSelect): Source {
  return { ...row, createdAt: row.createdAt.toISOString() };
}

/** The Sources in the `sources` Postgres schema. */
export function drizzleSourceRepository(database: Database): SourceRepository {
  return {
    add: async (source) => {
      await database.insert(sources).values({ ...source, createdAt: new Date(source.createdAt) });
    },
    list: async (targetId) => {
      const rows = await database
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
  };
}
