// Seam 1 of spec #80: what a Side thread changes in its Mock interview, through the server's HTTP
// and WebSocket API with real PGlite and the fake ACP agent. A Side thread before the answer marks
// the Attempt as received with a hint; the interviewer learns only that the thread exists. The
// fake agent replies «Отметка: <note>» to the server's note at the start of a prompt.
import { describe, expect, it } from "vitest";

import { isIdle } from "./chat-test-support.ts";
import {
  answerFollowUpNumber,
  answerWith,
  cardNow,
  followUpsOf,
} from "./interview-flow-test-support.ts";
import {
  agentTextWith,
  ask,
  cardAt,
  everyAgentText,
  hasQuestions,
  hasSpoken,
  interviewApi,
  isGraded,
  saysWhenIdle,
} from "./interview-test-support.ts";
import type { Interview } from "./interview-test-support.ts";
import {
  firstQuestion,
  hintMarks,
  isWorkingOn,
  openedSideThread,
  repliesWith,
} from "./side-thread-test-support.ts";

type Api = Awaited<ReturnType<typeof interviewApi>>;
type Run = Awaited<ReturnType<Api["started"]>>;

const isFinished = (view: Interview) => view.status === "finished";

describe("side thread hint", () => {
  it("marks the Attempt as received with a hint when the side thread opens before the answer", async () => {
    const api = await interviewApi();
    const { run, card } = await firstQuestion(api);

    const { thread } = await openedSideThread(api, {
      interviewId: run.interview.id,
      cardId: card.id,
    });
    await api.answer(run.interview.id, "Ответ [grade:3]");

    await run.events.waitFor(isGraded(0));
    await expect(hintMarks(api, { thread, position: 0 })).resolves.toStrictEqual({
      thread: true,
      card: true,
      attempt: true,
    });
  });

  it("marks the Attempt that the app records for «Не знаю» after a side thread before the answer", async () => {
    const api = await interviewApi();
    const { run, card } = await firstQuestion(api);

    const { thread } = await openedSideThread(api, {
      interviewId: run.interview.id,
      cardId: card.id,
    });
    await answerWith(api, run.interview.id, { skipped: true });

    await run.events.waitFor(isGraded(0));
    await expect(hintMarks(api, { thread, position: 0 })).resolves.toMatchObject({
      attempt: true,
    });
  });

  it("leaves no hint when the side thread opens after the answer, during Follow-ups", async () => {
    const api = await interviewApi();
    const run = await api.answered(["Опыт и резюме"], "Ответ [followup]");
    const card = cardAt(await run.events.waitFor(followUpsOf(1)), 0);

    const { thread } = await openedSideThread(api, {
      interviewId: run.interview.id,
      cardId: card.id,
    });
    await answerFollowUpNumber(api, run, { number: 1, text: "Пример: ретраи платежей." });

    await run.events.waitFor(isGraded(0));
    await expect(hintMarks(api, { thread, position: 0 })).resolves.toStrictEqual({
      thread: false,
      card: false,
      attempt: false,
    });
  });

  it("leaves no hint on an earlier question while the next one waits for its answer", async () => {
    const api = await interviewApi();
    const run = await api.answered(["Опыт и резюме"], "Ответ [grade:2]");
    await run.events.waitFor(hasQuestions(2));

    const { thread } = await openedSideThread(api, {
      interviewId: run.interview.id,
      cardId: run.card.id,
    });
    await api.answer(run.interview.id, "Второй ответ [grade:2]");

    await run.events.waitFor(isGraded(1));
    expect(thread.hinted).toBe(false);
    const second = await cardNow(api, run.interview.id, 1);
    await expect(api.debrief(run.interview.id, second)).resolves.toMatchObject({ hinted: false });
  });

  it("leaves no hint once the mock interview has ended", async () => {
    const api = await interviewApi();
    const run = await api.answered(["Опыт и резюме"], "Ответ [grade:2]");
    await run.events.waitFor(hasQuestions(2));
    await api.finish(run.interview.id);
    const ended = await run.events.waitFor(isFinished);

    const { thread } = await openedSideThread(api, {
      interviewId: run.interview.id,
      cardId: cardAt(ended, 1).id,
    });

    expect(thread.hinted).toBe(false);
    await expect(cardNow(api, run.interview.id, 1)).resolves.toMatchObject({ hinted: false });
  });
});

/** Keeps the interviewer in a `/wait` turn, which lasts until the Candidate stops it. */
async function keepInterviewerBusy(run: Run): Promise<void> {
  await run.chat.waitFor(hasSpoken);
  run.chat.send({ type: "prompt", text: "/wait" });
  await run.chat.waitFor(isWorkingOn("/wait"));
}

/** Opens a side thread with a question and writes in it once the agent has answered. */
async function talkInSideThread(api: Api, { run, cardId }: { run: Run; cardId: string }) {
  const { chat } = await openedSideThread(api, {
    interviewId: run.interview.id,
    cardId,
    question: "Секрет ветки: что такое идемпотентность?",
  });
  await chat.waitFor(repliesWith("Разбираю вопрос кандидата"));
  await ask(chat, "Сообщение ветки", "Фейковый агент получил");
}

/** Stops the interviewer's `/wait` turn and waits until it takes prompts again. */
async function stopInterviewer(run: Run): Promise<void> {
  run.chat.send({ type: "cancel" });
  await run.chat.waitFor(isIdle);
}

describe("side thread and the interviewer", () => {
  it("tells the interviewer only that the Candidate discussed the question, after its current turn and at the start of its next message", async () => {
    const api = await interviewApi();
    const { run, card } = await firstQuestion(api);
    await keepInterviewerBusy(run);

    await talkInSideThread(api, { run, cardId: card.id });

    expect(run.chat.views.at(-1)).toMatchObject({ status: "working" });
    await stopInterviewer(run);
    await api.answer(run.interview.id, "Ответ [grade:2]");
    const replied = await run.chat.waitFor(saysWhenIdle("Ответ получен."));
    expect(agentTextWith(replied, "Ответ получен.")).toMatch(
      /^Отметка: The Candidate discussed question 1 in a side thread\./u,
    );
    expect(everyAgentText(run.chat.views).join(" ")).not.toMatch(/Секрет ветки|Сообщение ветки/u);
  });
});
