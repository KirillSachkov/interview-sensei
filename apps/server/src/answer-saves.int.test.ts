// Seam 1 of spec #70: which Questions save_reference_answer takes. It writes only the visible
// Questions next_questions_without_answer gave the run, so a run never writes more answers than the
// Candidate chose, and it never overwrites an answer «из материала» or «проверен кандидатом».
import type { FastifyInstance } from "fastify";
import { describe, expect, it } from "vitest";

import {
  answerServer,
  checkedByCandidate,
  materialQuestion,
  saveAnswer,
  takenQueue,
} from "./answer-save-test-support.ts";
import {
  bankQuestion,
  handOut,
  hideQuestion,
  internetAnswer,
  manualSearch,
  manualTarget,
  searchEvents,
  startSearch,
} from "./answer-test-support.ts";
import { first } from "./model-test-support.ts";
import { questionsOf, toolResult } from "./setup-test-support.ts";

const kafka = "Как Kafka хранит смещения?";

const server = answerServer;
const save = saveAnswer;

/** The ids of the Target's Questions other than the taken one. */
async function otherQuestions(
  app: FastifyInstance,
  { targetId, taken }: { targetId: string; taken: string },
) {
  const bank = await questionsOf(app, targetId);
  return bank.map(({ id }) => id).filter((id) => id !== taken);
}

/** The tool's error for a Question the run did not give the agent. */
const notGiven = (id: string) =>
  `Ошибка save_reference_answer: The Question ${id} is not one next_questions_without_answer gave this answer search`;

describe("the Questions save_reference_answer takes", () => {
  it("refuses a Question of the Target outside the run's queue, so no more answers are written than chosen", async () => {
    const app = await server();
    const { target } = await manualTarget(app);
    await startSearch(app, target.id, 1);
    const { events } = await searchEvents(app, target.id);
    const { questions } = await handOut(events);
    const taken = first(questions).id;
    const [one = "", two = ""] = await otherQuestions(app, { targetId: target.id, taken });

    const refused = [
      await save(events, internetAnswer(one)),
      await save(events, internetAnswer(two)),
    ];
    const saved = await toolResult(events, "save_reference_answer", internetAnswer(taken));

    expect({ refused, saved }).toStrictEqual({
      refused: [notGiven(one), notGiven(two)],
      saved: { filled: 1, total: 1 },
    });
  });

  it("refuses a Question of the queue the agent has not taken yet", async () => {
    const app = await server();
    const { target, events } = await manualSearch(app);
    const later = first(await questionsOf(app, target.id)).id;

    const refused = await save(events, internetAnswer(later));

    expect(refused).toBe(notGiven(later));
  });

  it("refuses a taken Question that was hidden since", async () => {
    const { app, events, ids } = await takenQueue();
    await hideQuestion(app, ids(kafka));

    const refused = await save(events, internetAnswer(ids(kafka)));

    expect(refused).toBe(
      `Ошибка save_reference_answer: The Question ${ids(kafka)} is hidden; it needs no reference answer`,
    );
  });
});

describe("the answers save_reference_answer keeps", () => {
  it("never overwrites an answer «из материала»: the queue leaves it out, and a save is refused", async () => {
    const app = await server();
    const { target } = await manualTarget(app);
    const material = await materialQuestion(app, target.id);
    await startSearch(app, target.id, 20);
    const { events } = await searchEvents(app, target.id);
    const { questions } = await handOut(events, 10);

    const refused = await save(events, internetAnswer(material));

    expect(questions.map((question) => question.id)).not.toContain(material);
    expect(refused).toMatch(/^Ошибка save_reference_answer: /u);
    await expect(bankQuestion(app, target.id, material)).resolves.toMatchObject({
      referenceAnswer: { origin: "material" },
    });
  });

  it("never overwrites an answer «проверен кандидатом»: the queue leaves it out, and a save is refused", async () => {
    const { server: app, target, checkedId } = await checkedByCandidate();
    await startSearch(app, target.id, 20);
    const { events } = await searchEvents(app, target.id);

    const { questions, total } = await handOut(events, 10);
    const refused = await save(events, internetAnswer(checkedId));

    expect({
      total,
      handed: questions.some((question) => question.id === checkedId),
    }).toStrictEqual({ total: 2, handed: false });
    expect(refused).toMatch(/^Ошибка save_reference_answer: /u);
    await expect(bankQuestion(app, target.id, checkedId)).resolves.toMatchObject({
      referenceAnswer: { origin: "candidate", sample: "Ответ, который проверил кандидат." },
    });
  });
});
