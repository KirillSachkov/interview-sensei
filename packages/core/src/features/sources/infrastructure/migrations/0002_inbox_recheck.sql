ALTER TABLE "sources"."inbox_proposals" ADD COLUMN "mode" text DEFAULT 'processing' NOT NULL;--> statement-breakpoint
ALTER TABLE "sources"."inbox_proposals" ADD COLUMN "reason" text;