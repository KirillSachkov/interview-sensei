CREATE SCHEMA IF NOT EXISTS "app_settings";
--> statement-breakpoint
CREATE TABLE "app_settings"."settings" (
	"id" integer PRIMARY KEY NOT NULL,
	"default_agent" text
);
