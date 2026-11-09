CREATE TABLE "interviews"."disputes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"sequence" integer GENERATED ALWAYS AS IDENTITY (sequence name "interviews"."disputes_sequence_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"interview_id" uuid NOT NULL,
	"attempt_id" uuid NOT NULL,
	"grade" integer NOT NULL,
	"reason" text NOT NULL,
	"disputed_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "interviews"."disputes" ADD CONSTRAINT "disputes_interview_id_interviews_id_fk" FOREIGN KEY ("interview_id") REFERENCES "interviews"."interviews"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interviews"."disputes" ADD CONSTRAINT "disputes_attempt_id_attempts_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "interviews"."attempts"("id") ON DELETE no action ON UPDATE no action;