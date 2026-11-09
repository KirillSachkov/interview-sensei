ALTER TABLE "question_bank"."questions" ADD COLUMN "source_part" integer;--> statement-breakpoint
ALTER TABLE "question_bank"."questions" ADD COLUMN "section_kind" text;--> statement-breakpoint
ALTER TABLE "question_bank"."questions" ADD COLUMN "reference_answer" jsonb;