import { index, integer, pgSchema, text, timestamp, uuid } from "drizzle-orm/pg-core";

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
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull(),
  },
  (table) => [index("sources_by_target").on(table.targetId, table.number)],
);
