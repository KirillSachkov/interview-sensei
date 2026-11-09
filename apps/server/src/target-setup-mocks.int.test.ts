// Spec #45 with spec #41 and the rule «не подтверждён» of spec #47, seam 1: the draft of changes
// and the data of Mock interviews. A Topic that the draft merges into another one hands over its
// Attempts, so the Topic status and «Готовность» count them under the Topic that stays. A
// made-up Question that the Candidate changes through the draft becomes confirmed; a Topic merge
// alone leaves the mark.
import type { FastifyInstance } from "fastify";
import { describe, expect, it } from "vitest";

import { isIdle, openEvents } from "./chat-test-support.ts";
import { cardAt, hasQuestions, interviewApi } from "./interview-test-support.ts";
import { demoWithMock } from "./progress-test-support.ts";
import { api, applyDraft, callTool } from "./setup-test-support.ts";

interface Api {
  readonly server: FastifyInstance;
  readonly target: { readonly id: string };
}

/** The Topic status of each Topic of the plan, by name. */
async function statuses({ server, target }: Api) {
  const response = await api(server).get(`/api/targets/${target.id}/progress`);
  const { topics } = response.json<{ topics: { name: string; status: string }[] }>();
  return Object.fromEntries(topics.map((topic) => [topic.name, topic.status]));
}

/** The Target's setup session, once its agent takes prompts. */
async function setupOf({ server, target }: Api) {
  const opened = await api(server).post(`/api/targets/${target.id}/setup-session`);
  const events = await openEvents(server, opened.json<{ id: string }>().id);
  await events.waitFor(isIdle);
  return events;
}

const demoPlan = [
  { name: "Опыт и резюме", kind: "conversation" },
  { name: "TypeScript и Node.js", kind: "topics" },
  { name: "Проектирование", kind: "design" },
];

describe("progress after the draft of changes", () => {
  it("counts the Attempts of a merged Topic under the Topic it merged into", async () => {
    const mocked = await demoWithMock();
    const events = await setupOf(mocked);
    await callTool(events, "set_interview_plan", {
      sections: demoPlan,
      renameTopics: [{ from: "Опыт разработки", to: "Проектирование сервисов" }],
    });

    const response = await applyDraft(mocked.server, mocked.target.id);

    expect(response.statusCode).toBe(200);
    await expect(statuses(mocked)).resolves.toStrictEqual({
      "Проектирование сервисов": "shaky",
      "Система типов TypeScript": "not_started",
      "Асинхронность Node.js": "not_started",
      "Данные и надёжность": "not_started",
    });
  });
});

describe("the mark «не подтверждён» after the draft of changes", () => {
  it("confirms a made-up Question that the Candidate rephrases through the draft", async () => {
    const mock = await interviewApi();
    const { events } = await mock.answered(["Опыт и резюме"], "Ответ [new]");
    const made = cardAt(await events.waitFor(hasQuestions(2)), 1);
    const setup = await setupOf(mock);
    const text = "Расскажите о проекте, которым гордитесь.";
    await callTool(setup, "edit_questions", { edits: [{ id: made.questionId, text }] });

    await applyDraft(mock.server, mock.target.id);

    const bank = await mock.questions();
    expect(bank.filter((question) => question.id === made.questionId)).toMatchObject([
      { text, unconfirmed: false },
    ]);
  });

  it("keeps the mark on a made-up Question whose Topic the plan merges into another", async () => {
    const mock = await interviewApi();
    const { events } = await mock.answered(["Опыт и резюме"], "Ответ [new]");
    const made = cardAt(await events.waitFor(hasQuestions(2)), 1);
    const setup = await setupOf(mock);
    await callTool(setup, "set_interview_plan", {
      sections: demoPlan,
      renameTopics: [{ from: "Опыт разработки", to: "Проектирование сервисов" }],
    });

    await applyDraft(mock.server, mock.target.id);

    const bank = await mock.questions();
    expect(bank.filter((question) => question.id === made.questionId)).toMatchObject([
      { text: made.text, unconfirmed: true },
    ]);
  });
});
