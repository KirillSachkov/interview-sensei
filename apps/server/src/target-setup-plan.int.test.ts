// Spec #45, seam 1, ticket #49: the agent changes the Interview plan, Topics and Questions
// through the draft of changes; applying writes them all. The fake agent's
// `/tool <name> <json>` stands for the agent's calls of our MCP tools.
import { describe, expect, it } from "vitest";

import { startServer, temporaryDirectory } from "./chat-test-support.ts";
import type { TargetView } from "./model-test-support.ts";
import {
  api,
  applied,
  appliedTarget,
  callTool,
  questionsOf,
  setupChat,
  setupPlan,
  setupQuestions as questions,
  targetOf,
  toolResult,
} from "./setup-test-support.ts";

function topicOf(view: TargetView, name: string) {
  return view.sections.flatMap((section) => section.topics).find((topic) => topic.name === name);
}

const sectionNames = (view: TargetView) => view.sections.map((section) => section.name);

describe("the Interview plan through the draft", () => {
  it("deletes and reorders Sections and changes criteria, keeping the remaining Sections", async () => {
    const { server } = await startServer(await temporaryDirectory());
    const { target, events } = await appliedTarget(server);
    const [experience, go] = target.sections;

    const after = await applied({ server, events, targetId: target.id }, [
      "set_interview_plan",
      {
        sections: [
          { name: "Go", kind: "topics", gradingCriteria: "Практика", topics: ["Каналы"] },
          { name: "Опыт", kind: "conversation", enabled: false },
        ],
      },
    ]);

    expect(
      after.sections.map(({ id, name, gradingCriteria, enabled }) => ({
        id,
        name,
        gradingCriteria,
        enabled,
      })),
    ).toStrictEqual([
      { id: go?.id, name: "Go", gradingCriteria: "Практика", enabled: true },
      { id: experience?.id, name: "Опыт", gradingCriteria: "", enabled: false },
    ]);
  });

  it("keeps the switch, criteria and Topics of a Section whose plan entry leaves them out", async () => {
    const { server } = await startServer(await temporaryDirectory());
    const { target, events } = await appliedTarget(server);
    const go = target.sections.find((section) => section.name === "Go");
    const switched = await api(server).put(`/api/targets/${target.id}/sections/${go?.id}/enabled`, {
      enabled: false,
    });
    expect(switched.statusCode).toBe(200);

    const after = await applied({ server, events, targetId: target.id }, [
      "set_interview_plan",
      {
        sections: [
          { name: "Опыт", kind: "conversation" },
          { name: "Go", kind: "topics" },
        ],
      },
    ]);

    expect(after.sections.find((section) => section.name === "Go")).toMatchObject({
      id: go?.id,
      enabled: false,
      gradingCriteria: "Модель памяти",
      topics: [{ name: "Горутины" }, { name: "Каналы" }],
    });
  });

  it("keeps the Questions of a Topic that the plan leaves out", async () => {
    const { server } = await startServer(await temporaryDirectory());
    const { target, events } = await appliedTarget(server);
    const kafka = topicOf(target, "Kafka");

    const after = await applied({ server, events, targetId: target.id }, [
      "set_interview_plan",
      { sections: setupPlan.sections.slice(0, 2) },
    ]);

    expect(sectionNames(after)).toStrictEqual(["Опыт", "Go"]);
    const kept = await questionsOf(server, target.id, `?topicId=${kafka?.id}`);
    expect(kept.map((question) => question.text)).toStrictEqual(["Как Kafka хранит смещения?"]);
  });

  it("renames a Topic, which keeps its id and Questions", async () => {
    const { server } = await startServer(await temporaryDirectory());
    const { target, events } = await appliedTarget(server);
    const goroutines = topicOf(target, "Горутины");

    const after = await applied({ server, events, targetId: target.id }, [
      "set_interview_plan",
      {
        sections: [{ name: "Go", kind: "topics", topics: ["Горутины и планировщик", "Каналы"] }],
        renameTopics: [{ from: "Горутины", to: "Горутины и планировщик" }],
      },
    ]);

    expect(topicOf(after, "Горутины и планировщик")).toMatchObject({
      id: goroutines?.id,
      questionCount: 1,
    });
  });

  it("merges a Topic into another, which takes its Questions", async () => {
    const { server } = await startServer(await temporaryDirectory());
    const { target, events } = await appliedTarget(server);

    const after = await applied({ server, events, targetId: target.id }, [
      "set_interview_plan",
      {
        sections: [{ name: "Go", kind: "topics", topics: ["Конкурентность"] }],
        renameTopics: [
          { from: "Горутины", to: "Конкурентность" },
          { from: "Каналы", to: "Конкурентность" },
        ],
      },
    ]);

    expect(topicOf(after, "Конкурентность")?.questionCount).toBe(2);
  });

  it("refuses to rename a Topic the Target does not have", async () => {
    const { server } = await startServer(await temporaryDirectory());
    const { target, events } = await appliedTarget(server);

    const reply = await callTool(events, "set_interview_plan", {
      ...setupPlan,
      renameTopics: [{ from: "Rust", to: "Go" }],
    });

    expect(reply).toBe("Ошибка set_interview_plan: Темы «Rust» нет в цели.");
    await expect(toolResult(events, "get_draft")).resolves.toStrictEqual({ changes: [] });
    await expect(targetOf(server, target.id)).resolves.toMatchObject({ name: "Go-разработчик" });
  });
});

describe("the Questions through the draft", () => {
  it("stores the Questions applied through the draft as confirmed", async () => {
    const { server } = await startServer(await temporaryDirectory());
    // The rule «не подтверждён» (#47): the Candidate accepted these by applying the draft.
    const { target } = await appliedTarget(server);

    const stored = await questionsOf(server, target.id);

    expect(stored.map(({ text, unconfirmed }) => ({ text, unconfirmed }))).toStrictEqual(
      expect.arrayContaining(questions.map(({ text }) => ({ text, unconfirmed: false }))),
    );
    expect(stored).toHaveLength(questions.length);
  });

  it("add_questions leaves out duplicates of the Target and of the draft, and returns them", async () => {
    const { server } = await startServer(await temporaryDirectory());
    const { events } = await appliedTarget(server);
    const select = { topic: "Каналы", text: "Как устроен select?" };

    const first = await toolResult(events, "add_questions", {
      questions: [
        { topic: "Горутины", text: "что такое  ГОРУТИНА" },
        select,
        { ...select, text: "как устроен SELECT!" },
      ],
    });
    const second = await toolResult(events, "add_questions", { questions: [select] });

    expect(first).toMatchObject({
      draftChanges: 1,
      added: [{ text: "Как устроен select?" }],
      duplicates: ["что такое  ГОРУТИНА", "как устроен SELECT!"],
    });
    expect(second).toStrictEqual({
      recorded: null,
      added: [],
      duplicates: ["Как устроен select?"],
    });
  });

  it("edit_questions rephrases, moves, hides and rates Questions once the draft is applied", async () => {
    const { server } = await startServer(await temporaryDirectory());
    const { target, events } = await appliedTarget(server);
    const stored = await questionsOf(server, target.id);
    const [goroutine, , kafka] = questions.map((question) =>
      stored.find((entry) => entry.text === question.text),
    );

    const after = await applied({ server, events, targetId: target.id }, [
      "edit_questions",
      {
        edits: [
          { id: goroutine?.id, text: "Чем горутина отличается от потока?", topic: "Каналы" },
          { id: goroutine?.id, rating: "useful" },
          { id: kafka?.id, hidden: true },
        ],
      },
    ]);

    const channels = await questionsOf(
      server,
      target.id,
      `?topicId=${topicOf(after, "Каналы")?.id}`,
    );
    expect(channels.find((question) => question.id === goroutine?.id)).toMatchObject({
      text: "Чем горутина отличается от потока?",
      rating: "useful",
    });
    const hidden = await questionsOf(server, target.id, "?hidden=true");
    expect(hidden.map((question) => question.id)).toStrictEqual([kafka?.id]);
  });

  it("edit_questions refuses a Question of another Target", async () => {
    const { server } = await startServer(await temporaryDirectory());
    const other = await appliedTarget(server);
    const [foreign] = await questionsOf(server, other.target.id);
    const { events } = await setupChat(server);

    const reply = await callTool(events, "edit_questions", {
      edits: [{ id: foreign?.id, hidden: true }],
    });

    expect(reply).toBe(`Ошибка edit_questions: Вопроса ${foreign?.id} нет в цели.`);
    await expect(questionsOf(server, other.target.id, "?hidden=true")).resolves.toStrictEqual([]);
  });
});
