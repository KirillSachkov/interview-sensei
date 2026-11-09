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
  limitedInterview,
  manualTime,
  minutes,
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

describe("mock interview questions", () => {
  it("links a Deeper question to the parent Attempt in the same Topic", async () => {
    const api = await interviewApi();
    const { events } = await api.answered(["TypeScript и Node.js"], "Ответ [grade:3] [deeper]");

    const view = await events.waitFor(hasQuestions(2));

    const [parent, deeper] = [cardAt(view, 0), cardAt(view, 1)];
    expect(parent.attemptId).not.toBeNull();
    expect(deeper).toMatchObject({ parentAttemptId: parent.attemptId, topicId: parent.topicId });
    expect(deeper.questionId).not.toBe(parent.questionId);
  });

  it("saves a question the agent made up as unconfirmed in the bank", async () => {
    const api = await interviewApi();
    const { events, card } = await api.answered(["Опыт и резюме"], "Ответ [new]");

    const made = cardAt(await events.waitFor(hasQuestions(2)), 1);

    expect(made).toMatchObject({ text: "Фейковый вопрос: придуман без базы.", format: "open" });
    expect(made.topicId).toBe(card.topicId);
    const bank = await api.questions();
    expect(bank.filter((question) => question.id === made.questionId)).toMatchObject([
      { text: made.text, unconfirmed: true, level: "middle", topicId: card.topicId },
    ]);
  });

  it("moves to the next selected Section when the agent sets it", async () => {
    const api = await interviewApi();
    const design = api.sectionId("Проектирование");
    const { interview, events } = await api.answered(
      ["Опыт и резюме", "Проектирование"],
      "Ответ [section]",
    );
    expect(interview.currentSectionId).toBe(api.sectionId("Опыт и резюме"));

    const view = await events.waitFor(hasQuestions(2));

    expect(view.currentSectionId).toBe(design);
    expect(cardAt(view, 1).sectionId).toBe(design);
  });
});

describe("mock interview time limit", () => {
  it("tells the agent 5 minutes before the limit", async () => {
    const { interview, chat, time } = await limitedInterview();
    expect(interview).toMatchObject({ limitMinutes: 30, endsAt: "2026-01-02T03:34:05.000Z" });

    time.pass(minutes(25));
    await time.fire(minutes(25));

    await expect(chat.waitFor(saysWhenIdle("Осталось 5 минут"))).resolves.toMatchObject({
      status: "idle",
    });
  });

  it("shows the overtime after the limit and keeps the interview running", async () => {
    const { interview, events, api, time } = await limitedInterview();

    time.pass(minutes(31));
    await time.fire(minutes(30));

    const overtime = await events.waitFor((view) => view.overtime);
    expect(overtime.status).toBe("running");
    const answer = await api.answer(interview.id, "Ответ после лимита [grade:2]");
    expect(answer.statusCode).toBe(204);
    await events.waitFor(isGraded(0));
  });

  it("runs without a limit until the Candidate finishes it", async () => {
    const time = manualTime();
    const api = await interviewApi({ clock: time.clock, timer: time.timer });

    const { interview } = await api.started(["Опыт и резюме"]);

    expect(interview).toMatchObject({ limitMinutes: null, endsAt: null, overtime: false });
  });

  it.each([[15], [0], ["30"]])("refuses the limit %s", async (limitMinutes) => {
    const api = await interviewApi();

    const response = await api.start([api.sectionId("Опыт и резюме")], { limitMinutes });

    expect(response.statusCode).toBe(400);
  });
});

describe("mock interview difficulty", () => {
  it("keeps the chosen difficulty for the Target's next mock interview", async () => {
    const api = await interviewApi();
    const { interview, events } = await api.started(["Опыт и резюме"], { difficulty: "harder" });
    expect(interview.difficulty).toBe("harder");
    await events.waitFor(hasQuestions(1));
    await api.finish(interview.id);
    await events.waitFor((view) => view.status === "finished");

    const next = await api.started(["Опыт и резюме"]);

    expect(next.interview.difficulty).toBe("harder");
  });
});
