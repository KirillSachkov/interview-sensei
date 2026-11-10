-- #80 treated these Side threads as closed before closed_at existed: the threads of ended Mock
-- interviews (finished, or interrupted before pauses) and every thread of an archived Target. No
-- session is live while the migrations run. The threads of a running or paused Mock interview of an
-- active Target stay open: they may go on after the restart.
UPDATE "interviews"."side_threads" AS thread
SET "closed_at" = COALESCE(interview."finished_at", now())
FROM "interviews"."interviews" AS interview
WHERE thread."interview_id" = interview."id"
  AND thread."closed_at" IS NULL
  AND interview."status" IN ('finished', 'interrupted');
--> statement-breakpoint
-- The targets schema migrates before this one (composition.ts).
UPDATE "interviews"."side_threads" AS thread
SET "closed_at" = now()
FROM "interviews"."interviews" AS interview, "targets"."targets" AS target
WHERE thread."interview_id" = interview."id"
  AND interview."target_id" = target."id"
  AND thread."closed_at" IS NULL
  AND target."status" = 'archived';
