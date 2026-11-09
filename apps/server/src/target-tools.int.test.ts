import { describe, expect, it } from "vitest";

import { fixedTime } from "./chat-test-support.ts";
import { first, model, modelClient } from "./model-test-support.ts";

async function demoClient() {
  const features = await model();
  const { target } = await features.createDemo();
  const client = modelClient(features, target.id);
  const search = async (input: object = {}): Promise<unknown> => {
    const result = await client("search_questions", input);
    return JSON.parse(result.text);
  };
  return { features, target, client, search };
}

const newSection = (topicId: string, position = 0) => ({
  id: crypto.randomUUID(),
  name: "Секция",
  kind: "topics" as const,
  gradingCriteria: "Критерии",
  enabled: true,
  position,
  topicIds: [topicId],
});

async function twoTargets() {
  const features = await model();
  const ids = {
    own: crypto.randomUUID(),
    foreign: crypto.randomUUID(),
    ownTopic: crypto.randomUUID(),
    foreignTopic: crypto.randomUUID(),
  };
  await features.questionBank.seed(
    [
      { id: ids.ownTopic, targetId: ids.own, name: "Своя тема" },
      { id: ids.foreignTopic, targetId: ids.foreign, name: "Чужая тема" },
    ],
    [
      {
        id: crypto.randomUUID(),
        targetId: ids.own,
        topicId: ids.ownTopic,
        text: "Своя транзакция",
        format: "open",
        options: [],
        correctOptionIds: [],
        level: "middle",
        sourceIds: [],
        unconfirmed: false,
        hidden: false,
        rating: null,
        createdAt: fixedTime,
      },
      {
        id: crypto.randomUUID(),
        targetId: ids.foreign,
        topicId: ids.foreignTopic,
        text: "Чужая транзакция",
        format: "open",
        options: [],
        correctOptionIds: [],
        level: "middle",
        sourceIds: [],
        unconfirmed: false,
        hidden: false,
        rating: null,
        createdAt: fixedTime,
      },
    ],
  );
  const foreign = await features.targets.create({
    id: ids.foreign,
    name: "Чужая цель",
    sections: [newSection(ids.foreignTopic)],
  });
  const own = await features.targets.create({
    id: ids.own,
    name: "Своя цель",
    sections: [newSection(ids.ownTopic, 1), newSection(ids.ownTopic)],
    preferences: [
      { id: crypto.randomUUID(), text: "Больше практики", rejectedQuestionIds: [], active: true },
      {
        id: crypto.randomUUID(),
        text: "Неактивное правило",
        rejectedQuestionIds: [],
        active: false,
      },
    ],
  });
  return { features, ids, own, foreign, client: modelClient(features, ids.own) };
}

describe("target MCP tools on PGlite", () => {
  it("reads the session Target, ordered plan and active Preferences over MCP", async () => {
    const { client, own } = await twoTargets();
    const reply = await client("get_target");
    expect(JSON.parse(reply.text)).toStrictEqual(own);
    expect(own.sections.map((section) => section.position)).toStrictEqual([0, 1]);
    expect(own.preferences.map((preference) => preference.text)).toStrictEqual(["Больше практики"]);
    expect(first(first(own.sections).topics).questionCount).toBe(1);
  });

  it("reads the full demo Target over MCP", async () => {
    const { target, client } = await demoClient();
    const reply = await client("get_target");
    expect(JSON.parse(reply.text)).toStrictEqual(target);
  });

  it("reports sessions without a Target for both tools", async () => {
    const features = await model();
    const client = modelClient(features);
    await expect(client("get_target")).resolves.toStrictEqual({
      text: "This session has no Target",
      isError: false,
    });
    await expect(client("search_questions")).resolves.toStrictEqual({
      text: "This session has no Target",
      isError: false,
    });
  });

  it("persists an AgentSession's optional Target", async () => {
    const { features, target } = await demoClient();
    const session = await features.sessions.start({
      kind: "service-chat",
      agent: "fake",
      targetId: target.id,
    });
    await features.sessions.close();
    const view = await features.sessions.view(session.id);
    const sessions = await features.sessions.list();
    expect(view?.targetId).toBe(target.id);
    expect(sessions.find((entry) => entry.id === session.id)?.targetId).toBe(target.id);
  });

  it.each([
    [{}, 20],
    [{ limit: 50 }, 30],
    [{ limit: 2 }, 2],
    [{ text: "EVENT loop" }, 3],
    [{ text: "loop EVENT" }, 3],
    [{ text: "event отсутствует" }, 0],
    [{ text: "%" }, 0],
  ])("searches with %j and returns %s Questions", async (input, expected) => {
    const { search } = await demoClient();
    await expect(search(input)).resolves.toHaveLength(expected);
  });

  it("filters by Topic and Section and excludes hidden Questions", async () => {
    const { target, search, features } = await demoClient();
    const section = first(target.sections.filter((entry) => entry.kind === "topics"));
    const topicId = first(section.topicIds);
    const questions = await features.questionBank.search(target.id, { topicId });
    await expect(search({ topicId, limit: 50 })).resolves.toHaveLength(7);
    await expect(search({ sectionId: section.id, limit: 50 })).resolves.toHaveLength(20);
    await features.questionBank.hide(first(questions).id, true);
    await expect(search({ topicId, limit: 50 })).resolves.toHaveLength(6);
  });

  it("refuses foreign Topics, Sections and a supplied Target id", async () => {
    const { client, ids, foreign } = await twoTargets();
    const all = await client("search_questions", { text: "транзакция" });
    const byTopic = await client("search_questions", { topicId: ids.foreignTopic });
    const bySection = await client("search_questions", { sectionId: first(foreign.sections).id });
    expect(JSON.parse(all.text)).toMatchObject([{ targetId: ids.own, text: "Своя транзакция" }]);
    expect(JSON.parse(byTopic.text)).toStrictEqual([]);
    expect(JSON.parse(bySection.text)).toStrictEqual([]);
    await expect(client("get_target", { targetId: ids.foreign })).resolves.toMatchObject({
      isError: true,
    });
    await expect(client("search_questions", { targetId: ids.foreign })).resolves.toMatchObject({
      isError: true,
    });
  });

  it.each([0, 51, -1, 1.5])("refuses invalid search limit %s", async (limit) => {
    const { client } = await demoClient();
    await expect(client("search_questions", { limit })).resolves.toMatchObject({ isError: true });
  });
});

describe("target model references", () => {
  it("creates an unnamed draft with default settings and no plan", async () => {
    const features = await model();
    const draft = await features.targets.create();
    const reply = await modelClient(features, draft.id)("get_target");
    expect(JSON.parse(reply.text)).toMatchObject({
      name: "",
      status: "draft",
      level: null,
      agent: null,
      tone: "neutral",
      language: "ru",
      sections: [],
      preferences: [],
    });
  });

  it("refuses a Section with Topics of another Target", async () => {
    const { features, foreign } = await twoTargets();
    await expect(features.targets.create({ sections: [first(foreign.sections)] })).rejects.toThrow(
      "A Section must reference only Topics of its own Target",
    );
  });

  it("does not list archived Targets", async () => {
    const features = await model();
    await features.targets.create({ name: "Архив", status: "archived" });
    const draft = await features.targets.create();
    await expect(features.targets.list()).resolves.toStrictEqual([
      { id: draft.id, name: "", status: "draft", level: null },
    ]);
  });
});
