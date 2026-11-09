CREATE TABLE "interviews"."side_threads" (
	"id" uuid PRIMARY KEY NOT NULL,
	"interview_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"origin_kind" text NOT NULL,
	"origin_id" text NOT NULL,
	"asked_question_id" uuid NOT NULL,
	"fragment" text,
	"question" text,
	"hinted" boolean NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "side_threads_session_id_unique" UNIQUE("session_id")
);
--> statement-breakpoint
ALTER TABLE "interviews"."asked_questions" ADD COLUMN "hinted" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "interviews"."side_threads" ADD CONSTRAINT "side_threads_interview_id_interviews_id_fk" FOREIGN KEY ("interview_id") REFERENCES "interviews"."interviews"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interviews"."side_threads" ADD CONSTRAINT "side_threads_asked_question_id_asked_questions_id_fk" FOREIGN KEY ("asked_question_id") REFERENCES "interviews"."asked_questions"("id") ON DELETE no action ON UPDATE no action;