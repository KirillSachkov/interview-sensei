import { sql } from "drizzle-orm";
import {
  boolean,
  foreignKey,
  jsonb,
  pgSchema,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import type { Level, QuestionRating, QuizOption } from "../domain/question.ts";

export const questionBankSchema = pgSchema("question_bank");
export const topics = questionBankSchema.table(
  "topics",
  {
    id: uuid("id").primaryKey(),
    targetId: uuid("target_id").notNull(),
    name: text("name").notNull(),
  },
  (table) => [unique().on(table.targetId, table.name), unique().on(table.targetId, table.id)],
);
export const questions = questionBankSchema.table(
  "questions",
  {
    id: uuid("id").primaryKey(),
    targetId: uuid("target_id").notNull(),
    topicId: uuid("topic_id").notNull(),
    text: text("text").notNull(),
    format: text("format").$type<"open" | "quiz">().notNull(),
    options: jsonb("options")
      .$type<readonly QuizOption[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    correctOptionIds: jsonb("correct_option_ids")
      .$type<readonly string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    level: text("level").$type<Level>().notNull(),
    sourceIds: jsonb("source_ids")
      .$type<readonly string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    unconfirmed: boolean("unconfirmed").notNull().default(false),
    hidden: boolean("hidden").notNull().default(false),
    rating: text("rating").$type<QuestionRating>(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.targetId, table.topicId],
      foreignColumns: [topics.targetId, topics.id],
    }),
  ],
);
