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
import type { Level, Section, Target, TargetStatus } from "../domain/target.ts";

export const targetsSchema = pgSchema("targets");
export const targets = targetsSchema.table(
  "targets",
  {
    id: uuid("id").primaryKey(),
    name: text("name").notNull().default(""),
    status: text("status").$type<TargetStatus>().notNull().default("draft"),
    level: text("level").$type<Level>(),
    agent: text("agent"),
    tone: text("tone").$type<Target["tone"]>().notNull().default("neutral"),
    language: text("language").notNull().default("ru"),
    demo: boolean("demo").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull(),
  },
  (table) => [
    uniqueIndex("one_active_demo")
      .on(table.demo)
      .where(sql`${table.demo} = true AND ${table.status} = 'active'`),
  ],
);
export const sections = targetsSchema.table(
  "sections",
  {
    id: uuid("id").primaryKey(),
    targetId: uuid("target_id")
      .notNull()
      .references(() => targets.id),
    position: integer("position").notNull(),
    name: text("name").notNull(),
    kind: text("kind").$type<Section["kind"]>().notNull(),
    gradingCriteria: text("grading_criteria").notNull(),
    enabled: boolean("enabled").notNull().default(true),
    topicIds: jsonb("topic_ids").$type<readonly string[]>().notNull(),
  },
  (table) => [unique().on(table.targetId, table.position)],
);
export const preferences = targetsSchema.table("preferences", {
  id: uuid("id").primaryKey(),
  targetId: uuid("target_id")
    .notNull()
    .references(() => targets.id),
  text: text("text").notNull(),
  rejectedQuestionIds: jsonb("rejected_question_ids").$type<readonly string[]>().notNull(),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull(),
});
