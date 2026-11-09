import { index, integer, jsonb, pgSchema, timestamp, uuid } from "drizzle-orm/pg-core";

import type { DraftOperation } from "../domain/draft.ts";

export const targetSetupSchema = pgSchema("target_setup");
/** The draft of changes: one row per change, in the order of `number`. */
export const changes = targetSetupSchema.table(
  "changes",
  {
    id: uuid("id").primaryKey(),
    number: integer("number").generatedAlwaysAsIdentity().notNull(),
    targetId: uuid("target_id").notNull(),
    operation: jsonb("operation").$type<DraftOperation>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull(),
  },
  (table) => [index("changes_by_target").on(table.targetId, table.number)],
);
