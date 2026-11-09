ALTER TABLE "question_bank"."questions" ADD COLUMN "rating_comment" text;--> statement-breakpoint
ALTER TABLE "question_bank"."questions" ADD COLUMN "unseen" boolean DEFAULT false NOT NULL;