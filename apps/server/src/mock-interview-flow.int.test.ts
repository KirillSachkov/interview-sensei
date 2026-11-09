// Seam 1 of spec #41, the full interview flow (#53): quizzes, «Не знаю», Follow-ups, Deeper
// questions, Sections and the time limit, through the server's HTTP and WebSocket API with the
// fake agent's interviewer mode. Its markers in the Candidate's answers choose what it does next;
// see fake-agent-interviewer.ts in core.
import { describe, expect, it } from "vitest";

import {
  answerFollowUp,
  answerFollowUpNumber,
  answerWith,
  cardNow,
  correctOptions,
  followUpsOf,
  quizShown,
} from "./interview-flow-test-support.ts";
import {
  agentTextWith,
  cardAt,
  hasQuestions,
  interviewApi,
  isGraded,
  saysWhenIdle,
} from "./interview-test-support.ts";

describe("mock interview answers", () => {
  it("grades a quiz by the owner's rule without the agent", async () => {
    const api = await interviewApi();
    const { interview, events, chat, quiz } = await quizShown(api);
    const chosen = correctOptions(quiz, await api.questions());

    const response = await answerWith(api, interview.id, { optionIds: chosen });

    expect(response.statusCode).toBe(204);
    const graded = await cardNow(api, interview.id, 1);
    expect(graded.answer).toMatchObject({ text: null, optionIds: chosen, skipped: false });
    await expect(api.debrief(interview.id, graded)).resolves.toMatchObject({
      grade: 3,
      gradedBy: "quiz",
      gaps: "",
    });
    // The agent hears the result and goes on without recording the Attempt itself.
    await chat.waitFor(saysWhenIdle("Квиз оценён: 3."));
    await events.waitFor(hasQuestions(3));
  });

  it.each([
    ["no option", []],
    ["an option the quiz does not have", ["99"]],
  ])("refuses a quiz answer with %s", async (_case, optionIds) => {
    const api = await interviewApi();
    const { interview } = await quizShown(api);

    const response = await answerWith(api, interview.id, { optionIds });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: "invalid_options" });
  });

  it("records «Не знаю» itself as a skipped Attempt with Grade 0", async () => {
    const api = await interviewApi();
    const { interview, events, chat } = await api.started(["Опыт и резюме"]);
    const card = cardAt(await events.waitFor(hasQuestions(1)), 0);

    const response = await answerWith(api, interview.id, { skipped: true });

    expect(response.statusCode).toBe(204);
    const skipped = await cardNow(api, interview.id, 0);
    expect(skipped).toMatchObject({ id: card.id, answer: { text: null, skipped: true } });
    await expect(api.debrief(interview.id, skipped)).resolves.toMatchObject({
      grade: 0,
      gradedBy: "skip",
    });
    await chat.waitFor(saysWhenIdle("Вопрос пропущен."));
    await events.waitFor(hasQuestions(2));
  });
});

describe("mock interview Follow-ups", () => {
  const fakeFollowUp = "Фейковый Follow-up: приведите пример.";

  it("takes up to two Follow-ups on one answer and refuses the third", async () => {
    const api = await interviewApi();
    const run = await api.answered(["Опыт и резюме"], "Ответ [followup]");
    const { interview, events, chat } = run;
    await answerFollowUpNumber(api, run, { number: 1, text: "Пример [followup]" });

    await answerFollowUpNumber(api, run, { number: 2, text: "Ещё пример [followup] [grade:3]" });

    const refused = await chat.waitFor(saysWhenIdle("Follow-up отклонён:"));
    expect(agentTextWith(refused, "Follow-up отклонён:")).toContain(
      "The presented question already has two Follow-ups",
    );
    const graded = cardAt(await events.waitFor(isGraded(0)), 0);
    expect(graded.followUps).toMatchObject([
      { question: fakeFollowUp, answer: "Пример [followup]" },
      { question: fakeFollowUp, answer: "Ещё пример [followup] [grade:3]" },
    ]);
    await expect(api.debrief(interview.id, graded)).resolves.toMatchObject({ grade: 3 });
  });

  it("holds the Attempt until the Candidate answers the Follow-up", async () => {
    const api = await interviewApi();
    const { interview, events } = await api.answered(["Опыт и резюме"], "Ответ [followup]");

    const asked = cardAt(await events.waitFor(followUpsOf(1)), 0);

    expect(asked).toMatchObject({
      attemptId: null,
      followUps: [{ question: fakeFollowUp, answer: null }],
    });
    const second = await answerWith(api, interview.id, { text: "Второй ответ" });
    expect(second.json()).toMatchObject({ error: "already_answered" });
    await answerFollowUp(api, interview.id, "Пример [grade:1]");
    await events.waitFor(isGraded(0));
    const late = await answerFollowUp(api, interview.id, "Поздно");
    expect(late.json()).toMatchObject({ error: "no_follow_up" });
  });
});
