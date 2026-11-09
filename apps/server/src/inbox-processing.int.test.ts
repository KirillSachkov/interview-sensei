// Seam 1 of spec #47: the processing agent writes Questions straight into the bank, creates Topics
// only inside Sections, sees only its own Target, and finishes with an Inbox report.
import { describe, expect, it } from "vitest";

import { startServer, temporaryDirectory } from "./chat-test-support.ts";
import {
  attach,
  idsOf,
  inboxOf,
  latestReportId,
  manualProcessing,
  processingSession,
  replyStartingWith,
  sectionOf,
  sessionEnded,
  startProcessing,
  textOf,
  topicOf,
} from "./inbox-test-support.ts";
import { reportOf } from "./inbox-report-test-support.ts";
import { materialQuestion } from "./material-test-support.ts";
import { first } from "./model-test-support.ts";
import {
  appliedTarget,
  callTool,
  questionsOf,
  setupChat,
  targetOf,
  toolResult,
} from "./setup-test-support.ts";
import { sources } from "./source-test-support.ts";

describe("the Questions of Inbox processing", () => {
  it("add_bank_questions writes Questions straight into the bank with their Source, part, level, Section kind and reference answer", async () => {
    const { server, target, file, events } = await manualProcessing();
    const ids = { topicId: topicOf(target, "Go"), sourceId: file.id };

    await toolResult(events, "add_bank_questions", {
      questions: [
        materialQuestion(ids, "Как устроен планировщик Go?"),
        { ...materialQuestion(ids, "Что такое GOMAXPROCS?"), referenceAnswer: null },
      ],
    });

    const bank = await questionsOf(server, target.id, `?topicId=${ids.topicId}`);
    expect(bank.find((question) => question.text === "Как устроен планировщик Go?")).toMatchObject({
      level: "senior",
      sectionKind: "topics",
      sourceIds: [file.id],
      sourcePart: 1,
      unconfirmed: false,
      referenceAnswer: {
        ...materialQuestion(ids, "").referenceAnswer,
        origin: "material",
        sourceId: file.id,
        part: 1,
      },
    });
    expect(bank.find((question) => question.text === "Что такое GOMAXPROCS?")).toMatchObject({
      referenceAnswer: null,
    });
  });

  it("refuses a Question from a part the material does not have", async () => {
    const { target, file, events } = await manualProcessing();
    const question = materialQuestion({ topicId: topicOf(target, "Go"), sourceId: file.id }, "?");

    const reply = await callTool(events, "add_bank_questions", {
      questions: [{ ...question, part: 2 }],
    });

    expect(reply).toBe(`Ошибка add_bank_questions: The Source ${file.id} has no part 2`);
  });

  it("leaves out duplicates of the bank and of each other and counts them in the report", async () => {
    const { server, target, file, events } = await manualProcessing();
    const ids = { topicId: topicOf(target, "Go"), sourceId: file.id };

    const added = await toolResult(events, "add_bank_questions", {
      questions: ["что такое горутина", "Зачем нужен select?", "Зачем  нужен SELECT"].map((text) =>
        materialQuestion(ids, text),
      ),
    });
    const written = await toolResult(events, "write_inbox_report", { summary: "Вакансия." });

    expect(added).toMatchObject({
      added: [{ text: "Зачем нужен select?" }],
      duplicates: ["что такое горутина", "Зачем  нужен SELECT"],
    });
    await expect(reportOf(server, target.id, textOf(written, "reportId"))).resolves.toMatchObject({
      duplicates: 2,
      added: 1,
    });
  });

  it("create_topic adds a Topic only inside an existing Section and leaves the Sections as they are", async () => {
    const { server, target, events } = await manualProcessing();

    const created = await toolResult(events, "create_topic", {
      sectionId: sectionOf(target, "Go").id,
      name: "Планировщик",
    });
    const refused = await callTool(events, "create_topic", {
      sectionId: crypto.randomUUID(),
      name: "Алгоритмы",
    });

    expect(refused).toBe(
      "Ошибка create_topic: Create a Topic only inside an existing Section of the Target's plan",
    );
    const after = await targetOf(server, target.id);
    expect(sectionOf(after, "Go").topics.map(({ id, name }) => ({ id, name }))).toStrictEqual([
      ...sectionOf(target, "Go").topics.map(({ id, name }) => ({ id, name })),
      { id: textOf(created, "id"), name: "Планировщик" },
    ]);
    expect(after.sections.map((section) => section.name)).toStrictEqual([
      "Опыт",
      "Go",
      "Проектирование",
    ]);
  });
});

describe("the Inbox report", () => {
  it("write_inbox_report marks the materials read to the end «готов», ends the session and keeps the plan as it is", async () => {
    const { server, target, file, session, events } = await manualProcessing();
    await toolResult(events, "read_source", { id: file.id, part: 1 });

    const written = await toolResult(events, "write_inbox_report", {
      summary: "Разобрана вакансия.",
      proposals: { sections: [{ name: "Алгоритмы", kind: "topics", reason: "есть задачи" }] },
    });

    await expect(sources(server, target.id)).resolves.toMatchObject([
      { id: file.id, status: "ready" },
    ]);
    await expect(inboxOf(server, target.id)).resolves.toMatchObject({
      run: null,
      latestReport: { id: textOf(written, "reportId"), partial: false },
      unprocessed: 0,
    });
    const plan = await targetOf(server, target.id);
    expect(plan.sections.map((section) => section.name)).toStrictEqual([
      "Опыт",
      "Go",
      "Проектирование",
    ]);
    await sessionEnded(server, session);
  });

  it("shows the added Questions by Section and Topic, the doubts and the proposals", async () => {
    const { server, target, file, events } = await manualProcessing();
    await toolResult(events, "read_source", { id: file.id, part: 1 });
    const question = (section: string, text: string) =>
      materialQuestion({ topicId: topicOf(target, section), sourceId: file.id }, text);
    await toolResult(events, "add_bank_questions", {
      questions: [question("Go", "Что такое P в GMP?"), question("Проектирование", "Зачем Kafka?")],
    });

    const written = await toolResult(events, "write_inbox_report", {
      summary: "Разобрана вакансия: два вопроса.",
      doubtful: [{ text: "Зачем Kafka?", reason: "Kafka упомянута вскользь" }],
      proposals: { preferences: [{ text: "Больше практики", reason: "вакансия про продакшн" }] },
    });

    const report = await reportOf(server, target.id, textOf(written, "reportId"));
    expect(report).toMatchObject({
      summary: "Разобрана вакансия: два вопроса.",
      added: 2,
      sources: [{ id: file.id, status: "ready" }],
      doubtful: [{ text: "Зачем Kafka?", reason: "Kafka упомянута вскользь" }],
      proposals: { sections: [], preferences: [{ text: "Больше практики" }] },
    });
    expect(
      report.sections.map(({ name, topics }) => ({
        name,
        topics: topics.map((topic) => [topic.name, ...topic.questions.map(({ text }) => text)]),
      })),
    ).toStrictEqual([
      { name: "Go", topics: [["Горутины", "Что такое P в GMP?"]] },
      { name: "Проектирование", topics: [["Kafka", "Зачем Kafka?"]] },
    ]);
  });

  it("the processing agent works through the whole run by itself: Questions in the bank and a full report", async () => {
    const { server } = await startServer(await temporaryDirectory());
    const { target } = await appliedTarget(server);
    const body = "Как работает планировщик Go?\n\nG, M и P.";
    await attach(server, { targetId: target.id, name: "vacancy.md", body });

    await startProcessing(server, target.id);

    await processingSession(server, target.id);
    const report = await reportOf(server, target.id, await latestReportId(server, target.id));
    expect(report).toMatchObject({
      summary: "Фейковый разборщик: разобрано материалов: 1.",
      added: 1,
      sources: [{ status: "ready" }],
    });
    expect(first(first(report.sections).topics).questions).toMatchObject([
      { text: "Как работает планировщик Go?" },
    ]);
  });
});

describe("the limits of the processing agent", () => {
  it("the server refuses the processing agent's shell request itself: the processing has no chat", async () => {
    const { events } = await manualProcessing();

    events.send({ type: "prompt", text: "/permission" });

    await expect(replyStartingWith(events, "Фейковый агент получил ответ")).resolves.toBe(
      "Фейковый агент получил ответ: «Reject»",
    );
  });

  it("the processing agent sees only the materials of its own Target", async () => {
    const { server, target, file, events } = await manualProcessing();
    const { target: other } = await setupChat(server);
    const foreign = await attach(server, { targetId: other.id, name: "secret.md", body: "x" });

    const listed = await toolResult(events, "list_inbox");
    const read = await callTool(events, "read_source", { id: foreign.id, part: 1 });
    const added = await callTool(events, "add_bank_questions", {
      questions: [materialQuestion({ topicId: topicOf(target, "Go"), sourceId: foreign.id }, "?")],
    });

    expect(idsOf(listed)).toStrictEqual([file.id]);
    expect(read).toBe("Ошибка read_source: Source not found");
    expect(added).toBe(
      `Ошибка add_bank_questions: The Source ${foreign.id} is not a material of this processing`,
    );
  });
});
