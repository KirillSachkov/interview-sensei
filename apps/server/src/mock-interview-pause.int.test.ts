// Seam 1 of spec #83, ticket #84: the pause and the continuation of a Mock interview, through the
// server's HTTP and WebSocket API with real PGlite and the fake ACP agent in its interviewer mode.
// The time runs on a clock the tests move by hand.
import { describe, expect, it } from "vitest";

import { agentTexts, isIdle, openEvents, temporaryDirectory } from "./chat-test-support.ts";
import type { SessionView } from "./chat-test-support.ts";
import { manualTime, minutes } from "./interview-flow-test-support.ts";
import {
  ask,
  cardAt,
  hasQuestions,
  interviewApi,
  isGraded,
  saysWhenIdle,
} from "./interview-test-support.ts";
import { hasStatus, pauseApi, shownFirst, storeAgent } from "./pause-test-support.ts";
import { briefIn } from "./side-thread-test-support.ts";

type Api = Awaited<ReturnType<typeof interviewApi>>;

const isEnded = (view: SessionView) => view.status === "ended";

/** A server whose clock and timer the test moves, and the pause API on it. */
async function timedApi() {
  const time = manualTime();
  const api = await interviewApi({ clock: time.clock, timer: time.timer });
  return { time, api, pauses: pauseApi(api) };
}

/** Answers the first question with the text and waits for its Attempt and the second question. */
async function secondShown(api: Api, text: string) {
  const run = await api.answered(["Опыт и резюме"], text);
  const graded = cardAt(await run.events.waitFor(isGraded(0)), 0);
  await run.events.waitFor(hasQuestions(2));
  await run.chat.waitFor(saysWhenIdle("Ответ получен."));
  return { ...run, graded };
}

/** Pauses a mock interview on the first question, restarts the server on its data and pauses it there. */
async function pausedBeforeRestart() {
  const dataDirectory = await temporaryDirectory();
  const before = await interviewApi({ dataDirectory });
  const { interview, events } = await before.started(["Опыт и резюме"]);
  const shown = cardAt(await events.waitFor(hasQuestions(1)), 0);
  return { dataDirectory, before, interview, shown };
}

/** Pauses the Mock interview, goes on with it and follows the new session's chat once it waits. */
async function continuedChat(api: Api, interviewId: string) {
  const pauses = pauseApi(api);
  await pauses.pause(interviewId);
  const view = await pauses.resumed(interviewId);
  const chat = await openEvents(api.server, view.sessionId);
  await chat.waitFor(isIdle);
  return chat;
}

/** Answers with `[last]`, so no next question comes, and resolves with the graded card. */
async function answeredLast(api: Api, run: Awaited<ReturnType<typeof shownFirst>>, text: string) {
  await api.answer(run.interview.id, `${text} [last]`);
  return cardAt(await run.events.waitFor(isGraded(0)), 0);
}

/**
 * A mock interview paused before a restart, whose stored agent is Codex: a server with the fake
 * agent does not offer it.
 */
async function codexMockAfterRestart() {
  const { dataDirectory, before, interview } = await pausedBeforeRestart();
  await pauseApi(before).pause(interview.id);
  await before.stop();
  await storeAgent(dataDirectory, { interviewId: interview.id, agent: "codex" });
  return { interview, pauses: pauseApi(await interviewApi({ dataDirectory })) };
}

/**
 * A mock interview whose agent is in a turn when the Candidate presses «Завершить», so it has not
 * written its summary yet, paused by a server restart; resolves with the API of the new server.
 */
async function finishingBeforeRestart() {
  const { dataDirectory, before, interview } = await pausedBeforeRestart();
  const chat = await openEvents(before.server, interview.sessionId);
  await chat.waitFor(isIdle);
  chat.send({ type: "prompt", text: "/wait" });
  await chat.waitFor((view) => view.status === "working");
  await before.finish(interview.id);
  const finishing = await pauseApi(before).stored(interview.id);
  await before.stop();
  const after = await interviewApi({ dataDirectory });
  return { interview, finishing, after, pauses: pauseApi(after) };
}

/** «Продолжить», then «Завершить»; resolves with the summary once the agent finished. */
async function finishedAfterResume(api: Api, interviewId: string) {
  const pauses = pauseApi(api);
  await pauses.resumed(interviewId);
  const events = await pauses.follow(interviewId);
  await api.finish(interviewId);
  await events.waitFor(hasStatus("finished"));
  const summary = await api.get(`/api/interviews/${interviewId}/summary`);
  return summary.json<{ summary: string | null }>();
}

describe("mock interview pause", () => {
  it("stops the time and ends the agent session on «Пауза»", async () => {
    const { time, api, pauses } = await timedApi();
    const { interview, chat } = await shownFirst(api, { limitMinutes: 30 });
    time.pass(minutes(10));

    const paused = await pauses.pause(interview.id);
    time.pass(minutes(40));

    expect(paused.statusCode).toBe(204);
    await expect(chat.waitFor(isEnded)).resolves.toBeDefined();
    await expect(pauses.stored(interview.id)).resolves.toMatchObject({
      status: "paused",
      pauseReason: "candidate",
      endsAt: null,
      timeLeftMs: minutes(20),
    });
    await expect(pauses.pause(interview.id)).resolves.toMatchObject({ statusCode: 409 });
  });

  it("goes on in a new agent session from the time left on «Продолжить»", async () => {
    const { time, api, pauses } = await timedApi();
    const { interview } = await shownFirst(api, { limitMinutes: 30 });
    time.pass(minutes(10));
    await pauses.pause(interview.id);
    time.pass(minutes(40));

    const view = await pauses.resumed(interview.id);

    expect(view).toMatchObject({ status: "running", pauseReason: null, timeLeftMs: minutes(20) });
    expect(view.sessionId).not.toBe(interview.sessionId);
    expect(view.endsAt).toBe(new Date(time.clock.now().getTime() + minutes(20)).toISOString());
    await expect(pauses.resume(interview.id)).resolves.toMatchObject({ statusCode: 409 });
  });

  it("gives the new agent the continuation in get_brief: Sections, current Section, time left, asked questions with answers and Grades", async () => {
    const { time, api } = await timedApi();
    const run = await shownFirst(api, { limitMinutes: 30 });
    // `[last]`: no next question, so the new agent's replies reach the chat.
    const graded = await answeredLast(api, run, "Ответ про опыт [grade:3]");
    time.pass(minutes(12));

    const chat = await continuedChat(api, run.interview.id);
    await chat.waitFor(saysWhenIdle("Продолжаем после паузы."));
    const brief = briefIn(await ask(chat, "/brief", "Фейковый агент прочитал brief"));

    const experience = api.sectionId("Опыт и резюме");
    expect(brief).toMatchObject({
      sections: [{ id: experience }],
      mockInterview: { limitMinutes: 30, currentSectionId: experience },
      continuation: {
        currentSectionId: experience,
        timeLeftMinutes: 18,
        askedQuestions: [
          {
            number: 1,
            questionId: graded.questionId,
            text: graded.text,
            answer: { text: "Ответ про опыт [grade:3] [last]", skipped: false },
            attempt: { id: graded.attemptId, grade: 3 },
          },
        ],
        presentedQuestion: null,
      },
    });
  });

  it("records the answer to the question shown before the pause as usual after «Продолжить», and the chat shows both sessions", async () => {
    const api = await interviewApi();
    const { interview, events, chat } = await shownFirst(api);
    const before = agentTexts(await chat.waitFor(isIdle));
    const continued = await continuedChat(api, interview.id);

    await api.answer(interview.id, "Ответ после паузы [grade:3]");

    const graded = cardAt(await events.waitFor(isGraded(0)), 0);
    const replied = agentTexts(await continued.waitFor(saysWhenIdle("Ответ получен.")));
    await expect(api.debrief(interview.id, graded)).resolves.toMatchObject({ grade: 3 });
    expect(replied.slice(0, before.length)).toStrictEqual(before);
    // The new agent's text while the question waited for the answer stays out of the chat.
    expect(replied).not.toContain("Продолжаем после паузы: жду ответа.");
  });

  it("pauses the mock interview with the reason when its agent crashes, and goes on afterwards", async () => {
    const api = await interviewApi();
    const pauses = pauseApi(api);
    const { interview, events, chat, graded } = await secondShown(api, "Ответ [grade:2]");

    chat.send({ type: "prompt", text: "/crash" });

    const paused = await events.waitFor(hasStatus("paused"));
    expect(paused).toMatchObject({ pauseReason: "agent_failed" });
    expect(cardAt(paused, 0).attemptId).toBe(graded.attemptId);
    await expect(pauses.resumed(interview.id)).resolves.toMatchObject({ status: "running" });
  });

  it("pauses the running mock interview on a server restart; it goes on after the restart", async () => {
    const { dataDirectory, before, interview, shown } = await pausedBeforeRestart();
    await before.stop();

    const after = await interviewApi({ dataDirectory });

    const pauses = pauseApi(after);
    await expect(pauses.stored(interview.id)).resolves.toMatchObject({
      status: "paused",
      pauseReason: "server_stopped",
      questions: [{ id: shown.id, answer: null }],
    });
    const followed = await pauses.follow(interview.id);
    await pauses.resumed(interview.id);
    await after.answer(interview.id, "Ответ [grade:1]");
    await expect(followed.waitFor(isGraded(0))).resolves.toBeDefined();
  });

  it("offers to continue or finish a paused mock interview on «Начать мок»; finishing gives the summary Debrief", async () => {
    const api = await interviewApi();
    const { interview, events } = await secondShown(api, "Ответ [grade:3]");
    await pauseApi(api).pause(interview.id);

    const refused = await api.start([api.sectionId("Проектирование")]);
    await api.finish(interview.id);

    expect(refused.json()).toMatchObject({ error: "interview_paused", interviewId: interview.id });
    await events.waitFor(hasStatus("finished"));
    const summary = await api.get(`/api/interviews/${interview.id}/summary`);
    expect(summary.json()).toMatchObject({
      status: "finished",
      summary: null,
      answered: 1,
      unanswered: 1,
      topicChanges: [{ before: "not_started", after: "shaky" }],
    });
    await expect(api.start([api.sectionId("Проектирование")])).resolves.toMatchObject({
      statusCode: 201,
    });
  });

  it("explains an unavailable agent of the mock interview and goes on with the Target's agent, which the mock interview keeps", async () => {
    const { interview, pauses } = await codexMockAfterRestart();

    const refused = await pauses.resume(interview.id);
    const otherAgent = await pauses.resume(interview.id, { agent: "opencode" });
    const view = await pauses.resumed(interview.id, { agent: "fake" });

    expect(refused.json()).toStrictEqual({
      error: "agent_unavailable",
      agent: "codex",
      reason: null,
      targetAgent: "fake",
      message: "Агент мока больше не доступен. Можно продолжить мок с агентом цели.",
    });
    expect(otherAgent.statusCode).toBe(400);
    expect(view).toMatchObject({ status: "running", agent: "fake" });
    await expect(pauses.stored(interview.id)).resolves.toMatchObject({ agent: "fake" });
  });

  it("goes on with a mock interview paused while its agent wrote the summary as a running one: «Пауза» and «Завершить» work again", async () => {
    const { interview, finishing, after, pauses } = await finishingBeforeRestart();

    const continued = await pauses.resumed(interview.id);
    const paused = await pauses.pause(interview.id);
    const finished = await finishedAfterResume(after, interview.id);

    expect(finishing.finishRequestedAt).not.toBeNull();
    expect(continued).toMatchObject({ status: "running", finishRequestedAt: null });
    expect(paused.statusCode).toBe(204);
    expect(finished.summary).not.toBeNull();
  });
});
