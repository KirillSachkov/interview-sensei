CREATE SCHEMA IF NOT EXISTS "notes";
--> statement-breakpoint
CREATE TABLE "notes"."notes" ("id" serial PRIMARY KEY NOT NULL, "text" text NOT NULL);
