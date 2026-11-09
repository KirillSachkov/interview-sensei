// Seam 1 of spec #41: the session history of a Target through the server's HTTP API with real
// PGlite and the fake ACP agent. The tests move the injected Clock a day per Mock interview and
// let the server finish each one itself by running its 2-minute wait on the manual Timer.
import { describe, expect, it } from "vitest";

import { fixedTime } from "./chat-test-support.ts";
import { cardAt, hasQuestions, interviewApi, isGraded } from "./interview-test-support.ts";
import type { Interview } from "./interview-test-support.ts";
import { dispute } from "./progress-test-support.ts";
import { manualTime, minutes } from "./interview-flow-test-support.ts";

const finishWaitMs = minutes(2);
const dayMs = minutes(24 * 60);

const isFinished = (view: Interview) => view.status === "finished";

interface Summary {
  readonly id: string;
  readonly status: string;
  readonly startedAt: string;
  readonly sectionIds: readonly string[];
  readonly averageGrade: number | null;
}

interface HistoryPage {
  readonly items: readonly Summary[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
}

/** The start of the Mock interview of the day, from 1: that many days after fixedTime. */
const dayStart = (day: number) => new Date(Date.parse(fixedTime) + day * dayMs).toISOString();

/** A server whose Clock and Timer the test moves, with the demo Target. */
async function historyApi() {
  const time = manualTime();
  const api = await interviewApi({ clock: time.clock, timer: time.timer });
  /** A Mock interview on the Sections that starts a day later and that the server finishes itself. */
  const finishedOn = async (names: readonly string[]) => {
    time.pass(dayMs);
    const { interview, events } = await api.started(names);
    await api.finish(interview.id);
    await time.fire(finishWaitMs);
    await events.waitFor(isFinished);
    return interview.id;
  };
  const history = async (query = ""): Promise<HistoryPage> => {
    const response = await api.get(`/api/targets/${api.target.id}/interviews/history${query}`);
    return response.json<HistoryPage>();
  };
  return { ...api, time, finishedOn, history };
}

type Api = Awaited<ReturnType<typeof historyApi>>;

/** Mock interviews on the days from 1 to `count`, one after another; their ids, the oldest first. */
async function interviewsOnDays(api: Api, count: number, names: (day: number) => string[]) {
  const ids: string[] = [];
  for (let day = 1; day <= count; day += 1) {
    // oxlint-disable-next-line eslint/no-await-in-loop -- a Target runs one Mock interview at a time
    ids.push(await api.finishedOn(names(day)));
  }
  return ids;
}

const ids = (page: HistoryPage) => page.items.map((item) => item.id);

/** «Опыт и резюме» every day, and «Проектирование» too on even days. */
const alternating = (day: number) =>
  day % 2 === 0 ? ["Опыт и резюме", "Проектирование"] : ["Опыт и резюме"];

/**
 * A running Mock interview on «Опыт и резюме» with two graded answers, 1 and 3; resolves with it
 * and the card of the first answer.
 */
async function twoGradedAnswers(api: Api) {
  const run = await api.answered(["Опыт и резюме"], "Ответ [grade:1]");
  const first = cardAt(await run.events.waitFor(isGraded(0)), 0);
  await run.events.waitFor(hasQuestions(2));
  await api.answer(run.interview.id, "Ответ [grade:3]");
  await run.events.waitFor(isGraded(1));
  return { ...run, first };
}

describe("session history", () => {
  it("shows the 5 latest sessions on the canvas and every session in pages of 20, the newest first", async () => {
    const api = await historyApi();
    const oldestFirst = await interviewsOnDays(api, 22, () => ["Опыт и резюме"]);
    const newestFirst = oldestFirst.toReversed();

    const latest = await api.get(`/api/targets/${api.target.id}/interviews`);
    const first = await api.history();
    const second = await api.history("?page=2");

    expect(latest.json<Interview[]>().map((view) => view.id)).toStrictEqual(
      newestFirst.slice(0, 5),
    );
    expect(first).toMatchObject({ total: 22, page: 1, pageSize: 20 });
    expect(ids(first)).toStrictEqual(newestFirst.slice(0, 20));
    expect(ids(second)).toStrictEqual(newestFirst.slice(20));
  }, 60_000);

  it("filters the sessions by the start date and by a Section", async () => {
    const api = await historyApi();
    const design = api.sectionId("Проектирование");
    const [, day2, day3, day4] = await interviewsOnDays(api, 4, alternating);

    const between = await api.history(`?from=${dayStart(2)}&to=${dayStart(4)}`);
    const bySection = await api.history(`?sectionId=${design}`);
    const both = await api.history(`?from=${dayStart(3)}&sectionId=${design}`);

    expect({ ids: ids(between), total: between.total }).toStrictEqual({
      ids: [day3, day2],
      total: 2,
    });
    expect(ids(bySection)).toStrictEqual([day4, day2]);
    expect(ids(both)).toStrictEqual([day4]);
    await expect(api.history()).resolves.toMatchObject({
      items: [4, 3, 2, 1].map((day) => ({ startedAt: dayStart(day) })),
    });
  });

  it("gives each session its Sections and the average Grade after Disputes, but none while it runs", async () => {
    const api = await historyApi();
    const { interview, events, first } = await twoGradedAnswers(api);

    const running = await api.history();
    await dispute(api, {
      interviewId: interview.id,
      card: first,
      payload: { grade: 2, reason: "Пример был." },
    });
    await api.finish(interview.id);
    await events.waitFor(isFinished);

    expect(running.items).toMatchObject([{ status: "running", averageGrade: null }]);
    await expect(api.history()).resolves.toMatchObject({
      items: [
        {
          id: interview.id,
          status: "finished",
          sectionIds: [api.sectionId("Опыт и резюме")],
          averageGrade: 2.5,
        },
      ],
    });
  });
});
