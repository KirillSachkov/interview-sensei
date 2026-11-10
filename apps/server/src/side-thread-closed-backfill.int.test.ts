// Spec #83, review P7: migration 0008 closes the Side threads that #80 already treated as closed
// before `closed_at` existed: those of ended Mock interviews and those of archived Targets. The
// test makes the data with the API, then turns the stopped server's data back into what an earlier
// run left: no `closed_at` and migration 0008 not applied. The next start applies it.
import { describe, expect, it } from "vitest";

import { browserHeaders, isIdle, temporaryDirectory } from "./chat-test-support.ts";
import { interviewApi } from "./interview-test-support.ts";
import { hasStatus, pauseApi, storeWith } from "./pause-test-support.ts";
import { firstQuestion, openedSideThread } from "./side-thread-test-support.ts";
import type { SideThread } from "./side-thread-test-support.ts";

type Api = Awaited<ReturnType<typeof interviewApi>>;

/** A Side thread at the first question of a new Mock interview, once its agent waits. */
async function threadOfNewMock(api: Api) {
  const { run, card } = await firstQuestion(api);
  const { thread, chat } = await openedSideThread(api, {
    interviewId: run.interview.id,
    cardId: card.id,
  });
  await chat.waitFor(isIdle);
  return { thread, events: run.events };
}

/** A Side thread of a Mock interview that the Candidate then finished. */
async function threadOfFinishedMock(api: Api) {
  const opened = await threadOfNewMock(api);
  await api.finish(opened.thread.interviewId);
  await opened.events.waitFor(hasStatus("finished"));
  return opened;
}

/** Stops the server and forgets the closing marks and migration 0008, as before this change. */
async function beforeBackfill(api: Api, dataDirectory: string) {
  await api.stop();
  await storeWith(dataDirectory, [
    "update interviews.side_threads set closed_at = null",
    "delete from interviews.__drizzle_migrations where id = (select max(id) from interviews.__drizzle_migrations)",
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

describe("closing of earlier side threads", () => {
  it("closes the side threads of a finished mock interview and keeps those of a paused one open", async () => {
    const dataDirectory = await temporaryDirectory();
    const api = await interviewApi({ dataDirectory });
    const finished = await threadOfFinishedMock(api);
    const paused = await threadOfNewMock(api);
    await pauseApi(api).pause(paused.thread.interviewId);
    await beforeBackfill(api, dataDirectory);

    const [finishedClosed, pausedClosed] = await closedAfterStart(dataDirectory, [
      finished.thread,
      paused.thread,
    ]);

    expect(finishedClosed).not.toBeNull();
    expect(pausedClosed).toBeNull();
  });

  it("closes the side threads of an archived Target", async () => {
    const dataDirectory = await temporaryDirectory();
    const api = await interviewApi({ dataDirectory });
    const { thread } = await threadOfNewMock(api);
    await pauseApi(api).pause(thread.interviewId);
    await api.server.inject({
      method: "POST",
      url: `/api/targets/${api.target.id}/archive`,
      headers: browserHeaders(api.server),
    });
    await beforeBackfill(api, dataDirectory);

    const [closed] = await closedAfterStart(dataDirectory, [thread]);

    expect(closed).not.toBeNull();
  });
});
