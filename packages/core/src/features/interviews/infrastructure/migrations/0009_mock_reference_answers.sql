ALTER TABLE "interviews"."asked_questions" ADD COLUMN "reference_answer" jsonb;--> statement-breakpoint
ALTER TABLE "interviews"."attempts" ADD COLUMN "reference_points" jsonb;--> statement-breakpoint
ALTER TABLE "interviews"."attempts" ADD COLUMN "reference_disagreement" text;