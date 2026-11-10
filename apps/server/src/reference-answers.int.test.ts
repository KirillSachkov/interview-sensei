// Issue #65: the Candidate checks reference answers. «Проверен» in the side panel makes a reference
// answer «проверен кандидатом»; the setup agent corrects one through the draft of changes; a Dispute
// puts the Question on the list «проверить опорный ответ» of the zone «Цель». Issue #64: the
// interviewer grades against the reference answer, and its disagreement puts the Question there too.
import type { FastifyInstance } from "fastify";
import { describe, expect, it } from "vitest";

import { browserHeaders, isIdle, openEvents } from "./chat-test-support.ts";
import { idsOf, manualProcessing, topicOf } from "./inbox-test-support.ts";
import { answerWith } from "./interview-flow-test-support.ts";
import { cardAt, hasQuestions, interviewApi, isGraded } from "./interview-test-support.ts";
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

type Api = Awaited<ReturnType<typeof interviewApi>>;

/** Answers the first question of «Опыт и резюме»; resolves with a Dispute of its Grade. */
async function answeredForDispute(api: Api) {
  const run = await api.answered(["Опыт и резюме"], "Ответ [grade:1] [last]");
  const card = cardAt(await run.events.waitFor(isGraded(0)), 0);
  const disputeWith = async (reason: string) => {
    const response = await dispute(api, {
      interviewId: run.interview.id,
      card,
      payload: { grade: 3, reason },
    });
    expect(response.statusCode).toBe(200);
  };
  return { card, disputeWith };
}

/** The list holds the disputed Question with the reason; «Проверен» empties it. */
async function expectListedThenVerified(
  api: Api,
  { text, reason }: { text: string; reason: string },
) {
  const listed = await checksOf(api.server, api.target.id);
  expect(listed).toHaveLength(1);
  expect(first(listed)).toMatchObject({
    text,
    referenceCheck: { reason: "dispute", comment: reason },
  });
  await verify(api.server, first(listed).id);
  await expect(checksOf(api.server, api.target.id)).resolves.toStrictEqual([]);
}

// Each test starts its own server, which costs seconds in CI: a test checks one Question's path.
describe("«Проверен» and a corrected reference answer", () => {
  it("«Проверен» keeps the material and part; a correction through the draft drops them", async () => {
    const { server, target, file, setup, questionId } = await fromMaterial();
    const answerOf = async () => {
      const bank = await questionsOf(server, target.id);
      return bank.find((question) => question.id === questionId)?.referenceAnswer;
    };

    await expect(verify(server, questionId)).resolves.toMatchObject({ statusCode: 204 });
    await expect(answerOf()).resolves.toStrictEqual({
      ...materialQuestion({ topicId: "", sourceId: "" }, "").referenceAnswer,
      origin: "candidate",
      sourceId: file.id,
      part: 1,
    });

    await applied({ server, events: setup, targetId: target.id }, [
      "edit_questions",
      { edits: [{ id: questionId, referenceAnswer: corrected }] },
    ]);
    await expect(answerOf()).resolves.toStrictEqual({
      ...corrected,
      origin: "candidate",
      sourceId: null,
      part: null,
    });
  });
});

describe("the list «Проверить опорный ответ»", () => {
  it("gets the disputed Question with the reason; «Проверен» and a correction each take it off", async () => {
    const api = await demoWithReferenceAnswers();
    const { card, disputeWith } = await answeredForDispute(api);
    const reason = "Опорный ответ не учитывает мой пример.";

    await disputeWith(reason);
    await expectListedThenVerified(api, { text: card.text, reason });

    await disputeWith("Пункты неполные.");
    await expect(checksOf(api.server, api.target.id)).resolves.toHaveLength(1);
    await applied({ server: api.server, events: api.setup, targetId: api.target.id }, [
      "edit_questions",
      { edits: [{ id: card.questionId, referenceAnswer: { ...corrected, sample: "Новый." } }] },
    ]);
    await expect(checksOf(api.server, api.target.id)).resolves.toStrictEqual([]);
  });

  it("stays empty after a Dispute of a Question without a reference answer, which «Проверен» refuses", async () => {
    const api = await interviewApi();
    const { card, disputeWith } = await answeredForDispute(api);

    await disputeWith("Оценка занижена.");

    await expect(checksOf(api.server, api.target.id)).resolves.toStrictEqual([]);
    await expect(verify(api.server, card.questionId)).resolves.toMatchObject({
      statusCode: 409,
      body: JSON.stringify({ error: "no_reference_answer" }),
    });
    await expect(verify(api.server, crypto.randomUUID())).resolves.toMatchObject({
      statusCode: 404,
    });
  });
});

describe("the judgment against the reference answer", () => {
  it("shows in the Debrief which key points the answer covered", async () => {
    const api = await demoWithReferenceAnswers();
    const run = await api.answered(["Опыт и резюме"], "Ответ [grade:2] [covered:1,3] [last]");
    const card = cardAt(await run.events.waitFor(isGraded(0)), 0);

    await expect(api.debrief(run.interview.id, card)).resolves.toMatchObject({
      grade: 2,
      referencePoints: [
        { text: "Пример из практики", covered: true },
        { text: "Роль кандидата", covered: false },
        { text: "Результат в цифрах", covered: true },
      ],
      referenceDisagreement: null,
    });
    await expect(checksOf(api.server, api.target.id)).resolves.toStrictEqual([]);
  });

  it("puts the Question on the list with the interviewer's disagreement", async () => {
    const api = await demoWithReferenceAnswers();
    const run = await api.answered(["Опыт и резюме"], "Ответ [disagree] [last]");
    const card = cardAt(await run.events.waitFor(isGraded(0)), 0);
    const disagreement = "Фейковый интервьюер не согласен с опорным ответом.";

    await expect(api.debrief(run.interview.id, card)).resolves.toMatchObject({
      referenceDisagreement: disagreement,
    });
    const listed = await checksOf(api.server, api.target.id);
    expect(listed.map(({ text, referenceCheck }) => ({ text, referenceCheck }))).toStrictEqual([
      {
        text: card.text,
        referenceCheck: {
          reason: "interviewer",
          comment: disagreement,
          requestedAt: expect.any(String) as unknown,
        },
      },
    ]);
  });

  it("grades a Question without a reference answer from the agent's knowledge", async () => {
    const api = await interviewApi();
    const run = await api.answered(["Опыт и резюме"], "Ответ [grade:3] [last]");
    const card = cardAt(await run.events.waitFor(isGraded(0)), 0);

    await expect(api.debrief(run.interview.id, card)).resolves.toMatchObject({
      grade: 3,
      referencePoints: null,
      referenceDisagreement: null,
    });
  });

  it("shows «Не знаю» as covering none of the key points", async () => {
    const api = await demoWithReferenceAnswers();
    const run = await api.started(["Опыт и резюме"]);
    await run.events.waitFor(hasQuestions(1));
    await answerWith(api, run.interview.id, { skipped: true });
    const card = cardAt(await run.events.waitFor(isGraded(0)), 0);

    await expect(api.debrief(run.interview.id, card)).resolves.toMatchObject({
      gradedBy: "skip",
      referencePoints: corrected.points.map((text) => ({ text, covered: false })),
    });
  });
});
