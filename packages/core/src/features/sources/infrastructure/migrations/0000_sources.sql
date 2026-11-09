CREATE SCHEMA IF NOT EXISTS "sources";
--> statement-breakpoint
CREATE TABLE "sources"."sources" (
	"id" uuid PRIMARY KEY NOT NULL,
	"number" integer GENERATED ALWAYS AS IDENTITY (sequence name "sources"."sources_number_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"target_id" uuid NOT NULL,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"file" text,
	"url" text,
	"status" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE INDEX "sources_by_target" ON "sources"."sources" USING btree ("target_id","number");