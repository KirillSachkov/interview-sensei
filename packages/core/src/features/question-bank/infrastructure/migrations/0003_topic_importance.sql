ALTER TABLE "question_bank"."questions" ADD COLUMN "reference_check" jsonb;--> statement-breakpoint
ALTER TABLE "question_bank"."topics" ADD COLUMN "importance" text DEFAULT 'normal' NOT NULL;