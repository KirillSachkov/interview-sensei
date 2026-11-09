CREATE SCHEMA IF NOT EXISTS "target_setup";
--> statement-breakpoint
CREATE TABLE "target_setup"."changes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"number" integer GENERATED ALWAYS AS IDENTITY (sequence name "target_setup"."changes_number_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"target_id" uuid NOT NULL,
	"operation" jsonb NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE INDEX "changes_by_target" ON "target_setup"."changes" USING btree ("target_id","number");