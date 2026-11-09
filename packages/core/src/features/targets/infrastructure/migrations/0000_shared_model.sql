CREATE SCHEMA IF NOT EXISTS "targets";
--> statement-breakpoint
CREATE TABLE "targets"."preferences" (
	"id" uuid PRIMARY KEY NOT NULL,
	"target_id" uuid NOT NULL,
	"text" text NOT NULL,
	"rejected_question_ids" jsonb NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "targets"."sections" (
	"id" uuid PRIMARY KEY NOT NULL,
	"target_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"grading_criteria" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"topic_ids" jsonb NOT NULL,
	CONSTRAINT "sections_target_id_position_unique" UNIQUE("target_id","position")
);
--> statement-breakpoint
CREATE TABLE "targets"."targets" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"level" text,
	"agent" text,
	"tone" text DEFAULT 'neutral' NOT NULL,
	"language" text DEFAULT 'ru' NOT NULL,
	"demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "targets"."preferences" ADD CONSTRAINT "preferences_target_id_targets_id_fk" FOREIGN KEY ("target_id") REFERENCES "targets"."targets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "targets"."sections" ADD CONSTRAINT "sections_target_id_targets_id_fk" FOREIGN KEY ("target_id") REFERENCES "targets"."targets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "one_active_demo" ON "targets"."targets" USING btree ("demo") WHERE "targets"."targets"."demo" = true AND "targets"."targets"."status" = 'active';