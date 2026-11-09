CREATE TABLE "sources"."inbox_proposals" (
	"id" uuid PRIMARY KEY NOT NULL,
	"target_id" uuid NOT NULL,
	"items" jsonb NOT NULL,
	"status" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sources"."inbox_reports" (
	"id" uuid PRIMARY KEY NOT NULL,
	"number" integer GENERATED ALWAYS AS IDENTITY (sequence name "sources"."inbox_reports_number_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"target_id" uuid NOT NULL,
	"run_id" uuid NOT NULL,
	"mode" text NOT NULL,
	"source_ids" jsonb NOT NULL,
	"question_ids" jsonb NOT NULL,
	"duplicates" integer NOT NULL,
	"summary" text NOT NULL,
	"doubtful" jsonb NOT NULL,
	"proposals" jsonb NOT NULL,
	"partial" boolean NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sources"."inbox_runs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"target_id" uuid NOT NULL,
	"session_id" uuid,
	"mode" text NOT NULL,
	"status" text NOT NULL,
	"source_ids" jsonb NOT NULL,
	"question_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"duplicates" integer DEFAULT 0 NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "sources"."sources" ADD COLUMN "failure" text;--> statement-breakpoint
ALTER TABLE "sources"."sources" ADD COLUMN "parts" integer;--> statement-breakpoint
CREATE INDEX "inbox_proposals_by_target" ON "sources"."inbox_proposals" USING btree ("target_id","status");--> statement-breakpoint
CREATE INDEX "inbox_reports_by_target" ON "sources"."inbox_reports" USING btree ("target_id","number");--> statement-breakpoint
CREATE UNIQUE INDEX "inbox_runs_one_running" ON "sources"."inbox_runs" USING btree ("target_id") WHERE "sources"."inbox_runs"."status" = 'running';