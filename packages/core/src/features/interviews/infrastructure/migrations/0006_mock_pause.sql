DROP INDEX "interviews"."one_running_interview";--> statement-breakpoint
ALTER TABLE "interviews"."interviews" ADD COLUMN "paused_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "interviews"."interviews" ADD COLUMN "paused_ms" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "interviews"."interviews" ADD COLUMN "pause_reason" text;--> statement-breakpoint
ALTER TABLE "interviews"."interviews" ADD COLUMN "resumed_at" timestamp with time zone;--> statement-breakpoint
CREATE UNIQUE INDEX "one_active_interview" ON "interviews"."interviews" USING btree ("target_id") WHERE "interviews"."interviews"."status" in ('running', 'paused');