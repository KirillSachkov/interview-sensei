// Spec #83, review P7 and P9: migration 0008 closes the Side threads that #80 already treated as
// closed before `closed_at` existed: those of an ended Mock interview that were opened before its
// end. A thread opened later at a Debrief of the past Mock interview stays open, and so do the
// threads of a paused one. The test makes the data with the API on a clock it moves, then turns the
// stopped server's data back into what an earlier run left: no `closed_at` and migration 0008 not
// applied. The next start applies it.
import { readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { isIdle, temporaryDirectory } from "./chat-test-support.ts";
import { manualTime, minutes } from "./interview-flow-test-support.ts";
import { cardAt, interviewApi, isGraded } from "./interview-test-support.ts";
import { hasStatus, pauseApi, storeWith } from "./pause-test-support.ts";
import { debriefOrigin, openedSideThread } from "./side-thread-test-support.ts";
import type { Opening, SideThread } from "./side-thread-test-support.ts";

type Api = Awaited<ReturnType<typeof interviewApi>>;

const journal = path.join(
  import.meta.dirname,
  "../../../packages/core/src/features/interviews/infrastructure/migrations/meta/_journal.json",
);

/** When drizzle-kit made migration 0008: its history row has this `created_at`. */
async function backfillMillis(): Promise<string> {
  const text = await readFile(journal, "utf8");
  const when = /"when": (?<when>\d+),\s*"tag": "0008_/u.exec(text)?.groups?.when;
  if (when === undefined) {
    throw new Error("The journal has no migration 0008");
  }
  return when;
}

/** Opens the Side thread and waits until its agent waits for a message. */
async function idleThread(api: Api, opening: Opening): Promise<SideThread> {
  const { thread, chat } = await openedSideThread(api, opening);
  await chat.waitFor(isIdle);
  return thread;
}

/**
 * A finished Mock interview with a Side thread opened before its end, and one opened a minute
 * after it at the Debrief of its graded question.
 */
async function finishedMockThreads(api: Api, time: ReturnType<typeof manualTime>) {
  const run = await api.answered(["Опыт и резюме"], "Ответ [grade:3] [last]");
  const graded = cardAt(await run.events.waitFor(isGraded(0)), 0);
  const interviewId = run.interview.id;
  const before = await idleThread(api, { interviewId, cardId: graded.id });
  await api.finish(interviewId);
  await run.events.waitFor(hasStatus("finished"));
  time.pass(minutes(1));
  const after = await idleThread(api, { interviewId, origin: debriefOrigin(graded) });
  return { before, after };
}

/** A Side thread of a paused Mock interview. */
async function pausedMockThread(api: Api) {
  const run = await api.started(["Опыт и резюме"]);
  const card = cardAt(await run.events.waitFor((view) => view.questions.length > 0), 0);
  const thread = await idleThread(api, { interviewId: run.interview.id, cardId: card.id });
  await pauseApi(api).pause(run.interview.id);
  return thread;
}

/**
 * Undoes the migrations after 0008: the migrator applies only the migrations newer than the last
 * one it applied, so 0008 runs again only without them, and then they run again too.
 */
const laterMigrations = [
  // 0009 (#64): the reference answer of an asked question and its judgment in the Attempt.
  "alter table interviews.asked_questions drop column reference_answer",
  "alter table interviews.attempts drop column reference_points",
  "alter table interviews.attempts drop column reference_disagreement",
];

/**
 * Stops the server and forgets the closing marks and migration 0008 with the later ones, as before
 * this change.
 */
async function beforeBackfill(api: Api, dataDirectory: string, extra: readonly string[] = []) {
  await api.stop();
  await storeWith(dataDirectory, [
    "update interviews.side_threads set closed_at = null",
    ...laterMigrations,
    `delete from interviews.__drizzle_migrations where created_at >= ${await backfillMillis()}`,
    ...extra,
  ]);
}

/** The Side threads' `closedAt` after the next start, which applies migration 0008. */
async function closedAfterStart(dataDirectory: string, threads: readonly SideThread[]) {
  const after = await interviewApi({ dataDirectory });
  const listed = await Promise.all(
    threads.map(async ({ interviewId }) => {
      const response = await after.get(`/api/interviews/${interviewId}/side-threads`);
      return response.json<SideThread[]>();
    }),
  );
  return threads.map(({ id }) => listed.flat().find((entry) => entry.id === id)?.closedAt ?? null);
}

/** A server on a clock the test moves, over a new data directory. */
async function timedServer() {
  const dataDirectory = await temporaryDirectory();
  const time = manualTime();
  const api = await interviewApi({ dataDirectory, clock: time.clock, timer: time.timer });
  return { dataDirectory, time, api };
}

describe("closing of earlier side threads", () => {
  it("closes the side threads opened before a mock interview finished, and keeps later Debrief threads and a paused mock's threads open", async () => {
    const { dataDirectory, time, api } = await timedServer();
    const finished = await finishedMockThreads(api, time);
    const paused = await pausedMockThread(api);
    await beforeBackfill(api, dataDirectory);

    const closed = await closedAfterStart(dataDirectory, [finished.before, finished.after, paused]);

    expect(closed.map((closedAt) => closedAt !== null)).toStrictEqual([true, false, false]);
  });

  it("closes the side threads of a mock interview interrupted before pauses existed", async () => {
    const { dataDirectory, time, api } = await timedServer();
    const { before } = await finishedMockThreads(api, time);
    await beforeBackfill(api, dataDirectory, [
      `update interviews.interviews set status = 'interrupted' where id = '${before.interviewId}'`,
    ]);

    const [closed] = await closedAfterStart(dataDirectory, [before]);

    expect(closed).not.toBeNull();
  });
});
