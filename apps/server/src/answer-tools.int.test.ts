// Seam 1 of spec #70: the MCP tools of the answer search, driven with `/tool` in the session of a
// `[manual]` Target: the queue, the rules of overwriting, the limits of the agent and the report.
import { describe, expect, it } from "vitest";

import {
  agentAnswer,
  answerReportOf,
  answersOf,
  bankQuestion,
  handOut,
  idOf,
  internetAnswer,
  latestAnswerReport,
  manualSearch,
  manualTarget,
  reportIdOf,
  searchEvents,
  startSearch,
} from "./answer-test-support.ts";
import type { Handed } from "./answer-test-support.ts";
import { startServer, temporaryDirectory } from "./chat-test-support.ts";
import {
  attach,
  latestReportId,
  replyStartingWith,
  startProcessing,
} from "./inbox-test-support.ts";
import { first } from "./model-test-support.ts";
import { callTool, questionsOf, toolResult } from "./setup-test-support.ts";
import type { Events } from "./setup-test-support.ts";

const goroutine = "Что такое горутина?";
const channel = "Чем буферизованный канал отличается от небуферизованного?";
const kafka = "Как Kafka хранит смещения?";

async function server() {
  const started = await startServer(await temporaryDirectory());
  return started.server;
}

/** The handed Questions by text: the three were added at once, so their order is free. */
const byText = (questions: readonly Handed[]) =>
  questions.toSorted((left, right) => left.text.localeCompare(right.text));

/** A running search of a `[manual]` Target whose agent has taken the whole queue. */
async function takenQueue() {
  const app = await server();
  const search = await manualSearch(app);
  const { questions } = await handOut(search.events);
  return { app, ...search, ids: (text: string) => idOf(questions, text) };
}

/** Saves the answer and resolves with the tool's reply. */
async function save(events: Events, answer: object) {
  return callTool(events, "save_reference_answer", answer);
}

/** Processes a note into a Question with an answer «из материала»; resolves with its id. */
async function materialQuestion(app: Awaited<ReturnType<typeof server>>, targetId: string) {
  const body = "Что такое select?\nОн ждёт каналы.";
  await attach(app, { targetId, name: "notes.md", body });
  await startProcessing(app, targetId);
  await latestReportId(app, targetId);
  const bank = await questionsOf(app, targetId);
  const found = bank.find((question) => question.referenceAnswer?.origin === "material");
  if (found === undefined) {
    throw new Error("The processing wrote no answer from the material");
  }
  return found.id;
}

describe("the queue of the answer search agent", () => {
  it("next_questions_without_answer hands out the run's Questions with their Topic, level and Section kind, then an empty list", async () => {
    const app = await server();
    const { target, events } = await manualSearch(app);

    const batch = await handOut(events, 2);
    const rest = await handOut(events, 5);
    const done = await handOut(events);

    expect([batch, rest, done].map(({ left, total }) => ({ left, total }))).toStrictEqual([
      { left: 1, total: 3 },
      { left: 0, total: 3 },
      { left: 0, total: 3 },
    ]);
    expect(byText([...batch.questions, ...rest.questions, ...done.questions])).toMatchObject([
      { text: kafka, topic: "Kafka", sectionKind: "design" },
      { text: channel, topic: "Каналы", sectionKind: "topics" },
      { text: goroutine, topic: "Горутины", level: "middle", currentOrigin: null },
    ]);
    await expect(answersOf(app, target.id)).resolves.toMatchObject({
      run: { status: "running", filled: 0, total: 3 },
    });
  });
});

describe("save_reference_answer", () => {
  it("writes the answer with its origin and sources, and the status counts it", async () => {
    const { app, target, events, ids } = await takenQueue();

    const saved = await toolResult(events, "save_reference_answer", internetAnswer(ids(kafka)));

    expect(saved).toStrictEqual({ filled: 1, total: 3 });
    await expect(bankQuestion(app, target.id, ids(kafka))).resolves.toMatchObject({
      referenceAnswer: {
        points: ["Первый пункт", "Второй пункт", "Третий пункт"],
        sample: "Короткий образец ответа.",
        origin: "internet",
        sourceId: null,
        part: null,
        links: ["https://go.dev/doc/effective_go"],
      },
    });
    await expect(answersOf(app, target.id)).resolves.toMatchObject({
      withoutAnswer: 2,
      run: { filled: 1, total: 3 },
    });
  });

  it("replaces an answer «из знаний агента» with one from the internet, never the other way round", async () => {
    const { app, target, events, ids } = await takenQueue();
    await save(events, agentAnswer(ids(goroutine)));
    await save(events, internetAnswer(ids(channel)));

    const upgraded = await save(events, internetAnswer(ids(goroutine)));
    const downgraded = await save(events, agentAnswer(ids(channel)));

    expect(upgraded).toMatch(/^Результат /u);
    expect(downgraded).toBe(
      "Ошибка save_reference_answer: An answer from the agent's knowledge never replaces one from the internet",
    );
    await expect(bankQuestion(app, target.id, ids(channel))).resolves.toMatchObject({
      referenceAnswer: { origin: "internet" },
    });
    await expect(answersOf(app, target.id)).resolves.toMatchObject({ run: { filled: 2 } });
  });

  it("refuses links that do not match the origin", async () => {
    const { events, ids } = await takenQueue();
    const id = ids(kafka);

    const withoutLinks = await save(events, { ...internetAnswer(id), links: [] });
    const agentWithLinks = await save(events, { ...agentAnswer(id), links: ["https://a.dev"] });

    expect(withoutLinks).toBe(
      "Ошибка save_reference_answer: An answer from the internet needs the links to its sources",
    );
    expect(agentWithLinks).toBe(
      "Ошибка save_reference_answer: An answer with sources is from the internet: give the origin internet",
    );
  });

  it("never overwrites an answer «из материала»", async () => {
    const app = await server();
    const { target } = await manualTarget(app);
    const material = await materialQuestion(app, target.id);
    await startSearch(app, target.id, 1);
    const { events } = await searchEvents(app, target.id);

    const refused = await save(events, internetAnswer(material));

    expect(refused).toBe(
      "Ошибка save_reference_answer: The Question has a reference answer from its material; it stays",
    );
  });
});

describe("the limits of the answer search agent", () => {
  it("the server refuses the agent's shell request itself: the answer search has no chat", async () => {
    const { events } = await manualSearch(await server());

    events.send({ type: "prompt", text: "/permission" });

    await expect(replyStartingWith(events, "Фейковый агент получил ответ")).resolves.toBe(
      "Фейковый агент получил ответ: «Reject»",
    );
  });

  it("the agent changes only the reference answers of its own Target", async () => {
    const app = await server();
    const { events } = await manualSearch(app);
    const { target: other } = await manualTarget(app);
    const foreign = first(await questionsOf(app, other.id));

    const refused = await save(events, internetAnswer(foreign.id));
    const listed = await handOut(events, 10);

    expect(refused).toBe(
      `Ошибка save_reference_answer: The Question ${foreign.id} is not a Question of this Target`,
    );
    expect(listed.questions.map((question) => question.id)).not.toContain(foreign.id);
    await expect(bankQuestion(app, other.id, foreign.id)).resolves.toMatchObject({
      referenceAnswer: null,
    });
  });
});

describe("the agent's answer report", () => {
  it("counts the answers by origin, lists the Questions the agent skipped with its reason and shows the reported token usage", async () => {
    const { app, target, events, ids } = await takenQueue();
    await save(events, internetAnswer(ids(goroutine)));
    await save(events, agentAnswer(ids(channel)));
    events.send({ type: "prompt", text: "/usage 777" });
    await replyStartingWith(events, "Расход:");

    const written = await toolResult(events, "write_answer_report", {
      summary: "Записал два ответа.",
      failed: [{ questionId: ids(kafka), reason: "не нашёл источника" }],
    });

    await expect(answerReportOf(app, target.id, reportIdOf(written))).resolves.toMatchObject({
      partial: false,
      summary: "Записал два ответа.",
      total: 3,
      filled: 2,
      internet: 1,
      agent: 1,
      failed: [{ questionId: ids(kafka), text: kafka, reason: "не нашёл источника" }],
      usage: { tokens: 777, cost: null },
    });
    await expect(answersOf(app, target.id)).resolves.toMatchObject({
      run: null,
      latestReport: { id: reportIdOf(written), partial: false },
    });
  });

  it("says nothing of the usage when the agent did not report it", async () => {
    const app = await server();
    const { target, events } = await manualSearch(app);

    await toolResult(events, "write_answer_report", { summary: "Ничего не нашёл." });

    await expect(latestAnswerReport(app, target.id)).resolves.toMatchObject({
      filled: 0,
      failed: [],
      usage: null,
    });
  });
});
