CREATE SCHEMA IF NOT EXISTS "answer_search";
--> statement-breakpoint
CREATE TABLE "answer_search"."answer_reports" (
	"id" uuid PRIMARY KEY NOT NULL,
	"number" integer GENERATED ALWAYS AS IDENTITY (sequence name "answer_search"."answer_reports_number_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"target_id" uuid NOT NULL,
	"run_id" uuid NOT NULL,
	"session_id" uuid,
	"total" integer NOT NULL,
	"filled" jsonb NOT NULL,
	"failed" jsonb NOT NULL,
	"summary" text NOT NULL,
	"partial" boolean NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "answer_search"."answer_runs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"target_id" uuid NOT NULL,
	"session_id" uuid,
	"status" text NOT NULL,
	"requested" integer NOT NULL,
	"queue_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"handed_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"saved" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX "answer_reports_by_target" ON "answer_search"."answer_reports" USING btree ("target_id","number");--> statement-breakpoint
CREATE UNIQUE INDEX "answer_runs_one_active" ON "answer_search"."answer_runs" USING btree ("target_id") WHERE "answer_search"."answer_runs"."status" <> 'finished';