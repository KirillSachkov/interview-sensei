CREATE SCHEMA IF NOT EXISTS "interviews";
--> statement-breakpoint
CREATE TABLE "interviews"."asked_questions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"interview_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"question_id" uuid NOT NULL,
	"topic_id" uuid NOT NULL,
	"section_id" uuid NOT NULL,
	"text" text NOT NULL,
	"format" text NOT NULL,
	"options" jsonb NOT NULL,
	"correct_option_ids" jsonb NOT NULL,
	"parent_attempt_id" uuid,
	"presented_at" timestamp with time zone NOT NULL,
	"answer" jsonb,
	"follow_ups" jsonb DEFAULT '[]'::jsonb NOT NULL,
	CONSTRAINT "asked_questions_interview_id_position_unique" UNIQUE("interview_id","position")
);
--> statement-breakpoint
CREATE TABLE "interviews"."attempts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"interview_id" uuid NOT NULL,
	"asked_question_id" uuid NOT NULL,
	"grade" integer NOT NULL,
	"graded_by" text NOT NULL,
	"gaps" text NOT NULL,
	"justification" text NOT NULL,
	"strong_answer" text NOT NULL,
	"hinted" boolean DEFAULT false NOT NULL,
	"recorded_at" timestamp with time zone NOT NULL,
	CONSTRAINT "attempts_asked_question_id_unique" UNIQUE("asked_question_id")
);
--> statement-breakpoint
CREATE TABLE "interviews"."interviews" (
	"id" uuid PRIMARY KEY NOT NULL,
	"target_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"agent" text NOT NULL,
	"status" text NOT NULL,
	"section_ids" jsonb NOT NULL,
	"current_section_id" uuid,
	"limit_minutes" integer,
	"difficulty" text NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"finish_requested_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"summary" text,
	"next_step" text,
	CONSTRAINT "interviews_session_id_unique" UNIQUE("session_id")
);
--> statement-breakpoint
ALTER TABLE "interviews"."asked_questions" ADD CONSTRAINT "asked_questions_interview_id_interviews_id_fk" FOREIGN KEY ("interview_id") REFERENCES "interviews"."interviews"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interviews"."attempts" ADD CONSTRAINT "attempts_interview_id_interviews_id_fk" FOREIGN KEY ("interview_id") REFERENCES "interviews"."interviews"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interviews"."attempts" ADD CONSTRAINT "attempts_asked_question_id_asked_questions_id_fk" FOREIGN KEY ("asked_question_id") REFERENCES "interviews"."asked_questions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "one_running_interview" ON "interviews"."interviews" USING btree ("target_id") WHERE "interviews"."interviews"."status" = 'running';