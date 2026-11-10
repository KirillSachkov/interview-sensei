-- #80 treated these Side threads as closed before closed_at existed: the threads of an ended Mock
-- interview (finished, or interrupted before pauses) that were opened before it ended. A thread
-- opened later at a Debrief of the past Mock interview stays open, as #80 left it. A Mock interview
-- without finished_at cannot tell which threads came before its end; they stay open. No session is
-- live while the migrations run.
UPDATE "interviews"."side_threads" AS thread
SET "closed_at" = interview."finished_at"
FROM "interviews"."interviews" AS interview
WHERE thread."interview_id" = interview."id"
  AND thread."closed_at" IS NULL
  AND interview."status" IN ('finished', 'interrupted')
  AND interview."finished_at" IS NOT NULL
  AND thread."created_at" <= interview."finished_at";
