// Seam 1 of spec #41: the Mock interview through the server's HTTP and WebSocket API, with real
// PGlite and the fake ACP agent in its interviewer mode as a separate process. The fake
// interviewer takes the Grade from the marker `[grade:N]` in the answer; see
// fake-agent-interviewer.ts in core.
import { describe, expect, it } from "vitest";

import { agentTexts, fixedTime } from "./chat-test-support.ts";
import {
  agentTextWith,
  ask,
  cardAt,
  everyAgentText,
  hasQuestions,
  hasSpoken,
  interviewApi,
  isGraded,
  lastAgentText,
  saysWhenIdle,
  sectionNamed,
} from "./interview-test-support.ts";
import type { Interview } from "./interview-test-support.ts";

/** The fake interviewer's text right after it shows a question. */
const hint = "Подсказка до ответа";

const judgment = {
  gaps: "Фейковый интервьюер: не хватает примера из практики.",
  strongAnswer: "Фейковый интервьюер: определение, ограничения и пример из практики.",
};

/** What a view sent to the browser may never hold before the Candidate opens the Debrief. */
const gradeFields = /"grade"|gradedBy|justification|strongAnswer|"gaps"|поставил оценку/u;

const isFinished = (view: Interview) => view.status === "finished";

describe("mock interview", () => {
  it("starts on the demo Target with the selected Sections, and the agent shows a question from them", async () => {
    const api = await interviewApi();
    const names = ["TypeScript и Node.js", "Проектирование"];

    const { interview, events } = await api.started(names);

    expect(interview).toMatchObject({
      targetId: api.target.id,
      status: "running",
      sectionIds: names.map((name) => api.sectionId(name)),
      questions: [],
    });
    const card = cardAt(await events.waitFor(hasQuestions(1)), 0);
    const typescript = sectionNamed(api.target, "TypeScript и Node.js");
    expect(card).toMatchObject({ sectionId: typescript.id, format: "open", answer: null });
    expect(typescript.topicIds).toContain(card.topicId);
    const bank = await api.questions();
    expect(bank.filter((question) => question.id === card.questionId)).toMatchObject([
      { text: card.text },
    ]);
  });

  it("records the Candidate's free answer itself and takes only the judgment from the agent", async () => {
    const api = await interviewApi();
    const text = "Я отвечал за сервис платежей и мерил конверсию. [grade:3]";

    const { interview, events, card, response } = await api.answered(["Опыт и резюме"], text);

    expect(response.statusCode).toBe(204);
    const graded = cardAt(await events.waitFor(isGraded(0)), 0);
    expect(graded).toMatchObject({
      id: card.id,
      answer: { text, optionIds: [], skipped: false, answeredAt: fixedTime },
    });
    await expect(api.debrief(interview.id, graded)).resolves.toMatchObject({
      askedQuestionId: card.id,
      grade: 3,
      gradedBy: "agent",
      ...judgment,
      justification: "Фейковый интервьюер поставил оценку из метки в ответе: 3.",
      hinted: false,
      recordedAt: fixedTime,
    });
  });

  it("refuses a second Attempt on the same question", async () => {
    const api = await interviewApi();

    const { interview, events, chat } = await api.answered(
      ["Опыт и резюме"],
      "Ответ [grade:1] [twice]",
    );

    // One turn's chunks without message ids form one message: «Ответ получен.Повторная запись: …».
    const replied = await chat.waitFor(saysWhenIdle("Повторная запись:"));
    expect(agentTextWith(replied, "Повторная запись:")).toContain(
      "Повторная запись: The last question already has its Attempt; a recorded Attempt never changes.",
    );
    const graded = cardAt(await events.waitFor(isGraded(0)), 0);
    await expect(api.debrief(interview.id, graded)).resolves.toMatchObject({ grade: 1 });
  });

  it("keeps the agent's text between showing a question and the answer out of the browser", async () => {
    const api = await interviewApi();

    const { interview, events, chat } = await api.answered(["Опыт и резюме"], "Ответ [grade:2]");

    await events.waitFor(hasQuestions(2));
    const after = await chat.waitFor(saysWhenIdle("Ответ получен."));
    expect(everyAgentText(chat.views).filter((text) => text.includes(hint))).toStrictEqual([]);
    expect(agentTexts(after)).toStrictEqual(["Начинаем мок-собеседование.", "Ответ получен."]);
    // The server's template messages are not the Candidate's chat lines either.
    expect(after.entries.filter((entry) => entry.type === "candidate_message")).toStrictEqual([]);
    const stored = await api.get(`/api/sessions/${interview.sessionId}`);
    expect(stored.body).not.toContain(hint);
  });

  it("keeps the Grade out of the browser until the Candidate opens the Debrief", async () => {
    const api = await interviewApi();

    const { interview, events, chat } = await api.answered(["Опыт и резюме"], "Ответ [grade:3]");

    const graded = cardAt(await events.waitFor(isGraded(0)), 0);
    await events.waitFor(hasQuestions(2));
    await chat.waitFor(saysWhenIdle("Ответ получен."));
    const view = await api.get(`/api/interviews/${interview.id}`);
    const sent = [...events.raw, JSON.stringify(chat.views), view.body];
    expect(sent.filter((message) => gradeFields.test(message))).toStrictEqual([]);
    await expect(api.debrief(interview.id, graded)).resolves.toMatchObject({ grade: 3 });
  });

  it("refuses a second mock interview on the same Target while one runs", async () => {
    const api = await interviewApi();
    await api.started(["Опыт и резюме"]);

    const second = await api.start([api.sectionId("Проектирование")]);

    expect(second.statusCode).toBe(409);
    expect(second.json()).toStrictEqual({
      error: "interview_running",
      message: "По этой цели уже идёт мок. Завершите его, чтобы начать новый.",
    });
    const latest = await api.get(`/api/targets/${api.target.id}/interviews`);
    expect(latest.json<Interview[]>()).toHaveLength(1);
  });

  it.each([
    ["no Section", []],
    ["a Section of another plan", ["00000000-0000-4000-8000-000000000001"]],
  ])("refuses a mock interview with %s", async (_case, sectionIds) => {
    const api = await interviewApi();

    const response = await api.start(sectionIds);

    expect(response.statusCode).toBe(400);
    expect(response.json()).toStrictEqual({
      error: "invalid_sections",
      message: "Выберите хотя бы одну включённую секцию плана.",
    });
  });

  it("finishes with the agent's summary after the Candidate presses «Завершить»", async () => {
    const api = await interviewApi();
    const { interview, events, chat } = await api.answered(["Опыт и резюме"], "Ответ [grade:2]");
    await events.waitFor(hasQuestions(2));

    const finished = await api.finish(interview.id);

    expect(finished.statusCode).toBe(202);
    const done = await events.waitFor(isFinished);
    expect(done).toMatchObject({
      finishRequestedAt: fixedTime,
      summary: "Фейковый интервьюер: мок завершён.",
      nextStep: "Фейковый интервьюер: повторить темы с низкой оценкой.",
    });
    // The second question stays without an answer.
    expect(done.questions.map((card) => card.answer)).toMatchObject([
      { text: "Ответ [grade:2]" },
      null,
    ]);
    expect(lastAgentText(await chat.waitFor((view) => view.status === "ended"))).toBe(
      "Итог записан.",
    );
    await expect(api.start([api.sectionId("Проектирование")])).resolves.toMatchObject({
      statusCode: 201,
    });
  });

  it("gives the interviewer the Target's tone and language, its skill, and no shell or web", async () => {
    const api = await interviewApi();
    const { events, chat } = await api.started(["Опыт и резюме"]);
    await events.waitFor(hasQuestions(1));
    await chat.waitFor(hasSpoken);

    await expect(ask(chat, "/tools", "Запреты:")).resolves.toBe('Запреты: ["shell","web"]');
    await expect(ask(chat, "/skills", "Skills:")).resolves.toBe('Skills: ["sensei-interview"]');
    const role = await ask(chat, "/system", "Роль");
    expect(role).toContain("You are the interviewer of Interview Sensei");
    expect(role).toContain("The interview tone is neutral");
    expect(role).toContain('the language with the code "ru"');
  });
});
