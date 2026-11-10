import { describe, expect, it } from "vitest";

import { browserHeaders } from "./chat-test-support.ts";
import { manualProcessing, topicOf } from "./inbox-test-support.ts";
import { materialQuestion } from "./material-test-support.ts";
import { first } from "./model-test-support.ts";
import { callTool, questionsOf, toolResult } from "./setup-test-support.ts";

async function mergeContext() {
  const context = await manualProcessing({ notes: true });
  if (context.notes === null) {
    throw new Error("Missing notes");
  }
  const question = materialQuestion(
    { topicId: topicOf(context.target, "Go"), sourceId: context.file.id },
    "Как работает горутина?",
  );
  const send = async (questions: readonly object[]) =>
    toolResult(context.events, "add_bank_questions", { questions });
  const own = async () => {
    const bank = await questionsOf(context.server, context.target.id);
    return bank.filter((stored) => stored.text === question.text);
  };
  await send([{ ...question, referenceAnswer: null }]);
  return { ...context, question, send, own, id: first(await own()).id, article: context.notes.id };
}

describe("inbox duplicate reference answers", () => {
  it("attaches the article answer to the vacancy Question, preserving both origins", async () => {
    const { question, send, own, id, article } = await mergeContext();
    await expect(
      send([{ ...question, sourceId: article, text: "КАК работает горутина!" }]),
    ).resolves.toMatchObject({
      added: [],
      duplicates: ["КАК работает горутина!"],
      answers: [{ questionId: id, status: "attached" }],
    });
    await expect(own()).resolves.toMatchObject([
      {
        id,
        text: question.text,
        sourceIds: [question.sourceId],
        referenceAnswer: {
          ...question.referenceAnswer,
          origin: "material",
          sourceId: article,
          part: 1,
        },
      },
    ]);
    await expect(own()).resolves.toHaveLength(1);
  });

  it("attaches a paraphrase by id and preserves the first material answer on conflict", async () => {
    const { question, send, own, id, article } = await mergeContext();
    await expect(
      send([
        {
          ...question,
          existingQuestionId: id,
          text: "Что выполняет рантайм Go?",
          sourceId: article,
        },
      ]),
    ).resolves.toMatchObject({ added: [], answers: [{ questionId: id, status: "attached" }] });
    await expect(
      send([
        {
          ...question,
          referenceAnswer: { points: ["Один", "Два", "Три"], sample: "Другой ответ" },
        },
      ]),
    ).resolves.toMatchObject({ answers: [{ status: "material_preserved" }] });
    await expect(own()).resolves.toMatchObject([
      { id, referenceAnswer: { ...question.referenceAnswer, sourceId: article } },
    ]);
    await expect(own()).resolves.toHaveLength(1);
  });

  it("preserves a Candidate-verified answer", async () => {
    const { server, question, send, own, id, article } = await mergeContext();
    await send([question]);
    await server.inject({
      method: "POST",
      url: `/api/questions/${id}/reference-answer/verified`,
      headers: browserHeaders(server),
    });
    await expect(send([{ ...question, sourceId: article }])).resolves.toMatchObject({
      answers: [{ questionId: id, status: "candidate_protected" }],
    });
    await expect(own()).resolves.toMatchObject([
      {
        referenceAnswer: {
          ...question.referenceAnswer,
          origin: "candidate",
          sourceId: question.sourceId,
        },
      },
    ]);
  });

  it("enriches a repeat inside one batch and keeps the answer in reverse order", async () => {
    const { question, send, own } = await mergeContext();
    await expect(send([{ ...question, referenceAnswer: null }, question])).resolves.toMatchObject({
      added: [],
      answers: [{ status: "attached" }],
    });
    await send([question, { ...question, referenceAnswer: null }]);
    await expect(own()).resolves.toMatchObject([
      { referenceAnswer: { ...question.referenceAnswer, origin: "material" } },
    ]);
    const batch = { ...question, text: "Как растёт стек горутины?" };
    await expect(send([{ ...batch, referenceAnswer: null }, batch])).resolves.toMatchObject({
      added: [{ text: batch.text }],
      duplicates: [batch.text],
      answers: [{ status: "attached" }],
    });
  });

  it("rejects an unknown existing id and a foreign Source atomically", async () => {
    const { server, target, question, events } = await mergeContext();
    const before = await questionsOf(server, target.id);
    await expect(
      callTool(events, "add_bank_questions", {
        questions: [
          { ...question, text: "Новый вопрос?" },
          { ...question, existingQuestionId: crypto.randomUUID() },
        ],
      }),
    ).resolves.toContain("Existing Question is not in this Target");
    await expect(questionsOf(server, target.id)).resolves.toStrictEqual(before);
    await expect(
      callTool(events, "add_bank_questions", {
        questions: [{ ...question, sourceId: crypto.randomUUID() }],
      }),
    ).resolves.toContain("not a material of this processing");
    await expect(questionsOf(server, target.id)).resolves.toStrictEqual(before);
  });
});
