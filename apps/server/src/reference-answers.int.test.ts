// Issue #65: the Candidate checks reference answers. «Проверен» in the side panel makes a reference
// answer «проверен кандидатом»; the setup agent corrects one through the draft of changes; a Dispute
// puts the Question on the list «проверить опорный ответ» of the zone «Цель».
import type { FastifyInstance } from "fastify";
import { describe, expect, it } from "vitest";

import { browserHeaders, isIdle, openEvents } from "./chat-test-support.ts";
import { idsOf, manualProcessing, topicOf } from "./inbox-test-support.ts";
import { cardAt, interviewApi, isGraded } from "./interview-test-support.ts";
import { materialQuestion } from "./material-test-support.ts";
import { first } from "./model-test-support.ts";
import { dispute } from "./progress-test-support.ts";
import { applied, questionsOf, toolResult } from "./setup-test-support.ts";

const corrected = {
  points: ["Пример из практики", "Роль кандидата", "Результат в цифрах"],
  sample: "Хороший ответ называет проект, свою роль и результат.",
};

async function verify(server: FastifyInstance, questionId: string) {
  return server.inject({
    method: "POST",
    url: `/api/questions/${questionId}/reference-answer/verified`,
    headers: browserHeaders(server),
  });
}

/** The visible Questions of the list «проверить опорный ответ». */
async function checksOf(server: FastifyInstance, targetId: string) {
  return questionsOf(server, targetId, "?referenceCheck=true");
}

/** The setup session of an active Target: its agent waits for the Candidate's first message. */
async function setupOf(server: FastifyInstance, targetId: string) {
  const opened = await server.inject({
    method: "POST",
    url: `/api/targets/${targetId}/setup-session`,
    headers: browserHeaders(server),
  });
  expect(opened.statusCode).toBe(201);
  const events = await openEvents(server, opened.json<{ id: string }>().id);
  await events.waitFor(isIdle);
  return events;
}

/** A Question from the material with its reference answer «из материала», part 1. */
async function fromMaterial() {
  const { server, target, file, events, setup } = await manualProcessing();
  const topicId = topicOf(target, "Go");
  const result = await toolResult(events, "add_bank_questions", {
    questions: [materialQuestion({ topicId, sourceId: file.id }, "Как устроен планировщик Go?")],
  });
  const added: unknown =
    typeof result === "object" && result !== null && "added" in result ? result.added : null;
  return { server, target, file, setup, questionId: first(idsOf(added)) };
}

/** The demo Target whose Questions of «Опыт и резюме» got a reference answer through the draft. */
async function demoWithReferenceAnswers() {
  const api = await interviewApi();
  const { server, target } = api;
  const questions = await api.questions(`?sectionId=${api.sectionId("Опыт и резюме")}`);
  const events = await setupOf(server, target.id);
  await applied({ server, events, targetId: target.id }, [
    "edit_questions",
    { edits: questions.map(({ id }) => ({ id, referenceAnswer: corrected })) },
  ]);
  return { ...api, setup: events };
}

/** Answers the first question of «Опыт и резюме» and disputes its Grade with the reason. */
async function disputedAnswer(api: Awaited<ReturnType<typeof interviewApi>>, reason: string) {
  const run = await api.answered(["Опыт и резюме"], "Ответ [grade:1] [last]");
  const card = cardAt(await run.events.waitFor(isGraded(0)), 0);
  const response = await dispute(api, {
    interviewId: run.interview.id,
    card,
    payload: { grade: 3, reason },
  });
  expect(response.statusCode).toBe(200);
  return card;
}

describe("«Проверен»", () => {
  it("makes the reference answer «проверен кандидатом», keeping its material and part", async () => {
    const { server, target, file, questionId } = await fromMaterial();

    const response = await verify(server, questionId);

    expect(response.statusCode).toBe(204);
    const bank = await questionsOf(server, target.id);
    expect(bank.find((question) => question.id === questionId)?.referenceAnswer).toStrictEqual({
      ...materialQuestion({ topicId: "", sourceId: "" }, "").referenceAnswer,
      origin: "candidate",
      sourceId: file.id,
      part: 1,
    });
  });

  it("answers 409 for a Question without a reference answer and 404 for an unknown one", async () => {
    const { server, questions } = await interviewApi();
    const question = first(await questions());

    await expect(verify(server, question.id)).resolves.toMatchObject({
      statusCode: 409,
      body: JSON.stringify({ error: "no_reference_answer" }),
    });
    await expect(verify(server, crypto.randomUUID())).resolves.toMatchObject({ statusCode: 404 });
  });
});

describe("a corrected reference answer", () => {
  it("is «проверен кандидатом» without a material after «Применить»", async () => {
    const { server, target, setup, questionId } = await fromMaterial();

    await applied({ server, events: setup, targetId: target.id }, [
      "edit_questions",
      { edits: [{ id: questionId, referenceAnswer: corrected }] },
    ]);

    const bank = await questionsOf(server, target.id);
    expect(bank.find((question) => question.id === questionId)?.referenceAnswer).toStrictEqual({
      ...corrected,
      origin: "candidate",
      sourceId: null,
      part: null,
    });
  });
});

describe("the list «проверить опорный ответ»", () => {
  it("gets the disputed Question with the Candidate's reason; «Проверен» takes it off", async () => {
    const api = await demoWithReferenceAnswers();
    const reason = "Опорный ответ не учитывает мой пример.";
    const card = await disputedAnswer(api, reason);

    const listed = await checksOf(api.server, api.target.id);

    expect(listed).toHaveLength(1);
    expect(first(listed)).toMatchObject({
      text: card.text,
      referenceCheck: { reason: "dispute", comment: reason },
    });
    await verify(api.server, first(listed).id);
    await expect(checksOf(api.server, api.target.id)).resolves.toStrictEqual([]);
  });

  it("loses a Question whose reference answer the setup agent corrected", async () => {
    const api = await demoWithReferenceAnswers();
    await disputedAnswer(api, "Пункты неполные.");
    const [listed] = await checksOf(api.server, api.target.id);

    await applied({ server: api.server, events: api.setup, targetId: api.target.id }, [
      "edit_questions",
      { edits: [{ id: listed?.id, referenceAnswer: { ...corrected, sample: "Новый образец." } }] },
    ]);

    await expect(checksOf(api.server, api.target.id)).resolves.toStrictEqual([]);
  });

  it("stays empty after a Dispute of a Question without a reference answer", async () => {
    const api = await interviewApi();

    await disputedAnswer(api, "Оценка занижена.");

    await expect(checksOf(api.server, api.target.id)).resolves.toStrictEqual([]);
  });
});
