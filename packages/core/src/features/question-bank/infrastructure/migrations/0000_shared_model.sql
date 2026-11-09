CREATE SCHEMA IF NOT EXISTS "question_bank";
--> statement-breakpoint
CREATE TABLE "question_bank"."questions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"target_id" uuid NOT NULL,
	"topic_id" uuid NOT NULL,
	"text" text NOT NULL,
	"format" text NOT NULL,
	"options" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"correct_option_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"level" text NOT NULL,
	"source_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"unconfirmed" boolean DEFAULT false NOT NULL,
	"hidden" boolean DEFAULT false NOT NULL,
	"rating" text,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "question_bank"."topics" (
	"id" uuid PRIMARY KEY NOT NULL,
	"target_id" uuid NOT NULL,
	"name" text NOT NULL,
	CONSTRAINT "topics_target_id_name_unique" UNIQUE("target_id","name"),
	CONSTRAINT "topics_target_id_id_unique" UNIQUE("target_id","id")
);
--> statement-breakpoint
ALTER TABLE "question_bank"."questions" ADD CONSTRAINT "questions_target_id_topic_id_topics_target_id_id_fk" FOREIGN KEY ("target_id","topic_id") REFERENCES "question_bank"."topics"("target_id","id") ON DELETE no action ON UPDATE no action;