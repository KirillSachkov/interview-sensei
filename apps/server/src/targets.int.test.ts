import { describe, expect, it } from "vitest";

import { browserHeaders, startServer, temporaryDirectory } from "./chat-test-support.ts";
import { demoApi, first } from "./model-test-support.ts";

describe("target HTTP API", () => {
  it("creates the demo Target once with three Sections and thirty Questions", async () => {
    const api = await demoApi();
    const repeated = await api.createDemo();
    expect(api.created.statusCode).toBe(201);
    expect(api.target).toMatchObject({
      name: "Middle backend-разработчик на TypeScript",
      status: "active",
      level: "middle",
      tone: "neutral",
      language: "ru",
      demo: true,
    });
    expect(api.target.sections.map((section) => section.kind)).toStrictEqual([
      "conversation",
      "topics",
      "design",
    ]);
    expect(repeated.statusCode).toBe(200);
    expect(repeated.json()).toStrictEqual(api.target);
  });

  it("preserves the Target, Questions, rating and visibility after a server restart", async () => {
    const directory = await temporaryDirectory();
    const api = await demoApi(directory);
    const question = first(await api.questions());
    await api.put(`/api/questions/${question.id}/rating`, { rating: "wrong" });
    await api.put(`/api/questions/${question.id}/hidden`, { hidden: true });
    await api.stop();
    const restarted = await demoApi(directory);
    const questions = await restarted.questions("?hidden=true");
    expect(restarted.target).toStrictEqual(api.target);
    expect(questions).toStrictEqual([{ ...question, rating: "wrong", hidden: true }]);
  });

  it("returns Topics with Question counts and filters Questions by Topic", async () => {
    const api = await demoApi();
    const question = first(await api.questions());
    const filtered = await api.questions(`?topicId=${question.topicId}`);
    expect(
      api.target.sections
        .flatMap((section) => section.topics)
        .map((topic) => topic.questionCount)
        .toSorted((left, right) => left - right),
    ).toStrictEqual([5, 5, 6, 7, 7]);
    await expect(api.questions()).resolves.toHaveLength(30);
    expect(filtered.length).toBeGreaterThan(0);
    expect(filtered.every((entry) => entry.topicId === question.topicId)).toBe(true);
  });
});

describe("question HTTP writes", () => {
  it.each(["useful", "irrelevant", "wrong", null])("stores Question rating %s", async (rating) => {
    const api = await demoApi();
    const question = first(await api.questions());
    const response = await api.put(`/api/questions/${question.id}/rating`, { rating });
    const questions = await api.questions();
    expect(response.statusCode).toBe(204);
    expect(questions.find((entry) => entry.id === question.id)?.rating).toBe(rating);
  });

  it("clears a previous Question rating", async () => {
    const api = await demoApi();
    const question = first(await api.questions());
    await api.put(`/api/questions/${question.id}/rating`, { rating: "useful" });
    await api.put(`/api/questions/${question.id}/rating`, { rating: null });
    const questions = await api.questions();
    expect(questions.find((entry) => entry.id === question.id)?.rating).toBeNull();
  });

  it("hides a Question and restores it on request", async () => {
    const api = await demoApi();
    const question = first(await api.questions());
    await api.put(`/api/questions/${question.id}/hidden`, { hidden: true });
    await expect(api.questions()).resolves.toHaveLength(29);
    await expect(api.questions("?hidden=true")).resolves.toStrictEqual([
      { ...question, hidden: true },
    ]);
    await api.put(`/api/questions/${question.id}/hidden`, { hidden: false });
    await expect(api.questions()).resolves.toHaveLength(30);
  });

  it.each([
    "/api/targets/00000000-0000-4000-8000-000000000099",
    "/api/targets/00000000-0000-4000-8000-000000000099/questions",
  ])("returns 404 for %s", async (url) => {
    const api = await demoApi();
    const response = await api.get(url);
    expect(response.statusCode).toBe(404);
  });

  it.each([
    ["rating", { rating: "useful" }],
    ["hidden", { hidden: true }],
  ])("returns 404 for an unknown Question's %s", async (endpoint, payload) => {
    const api = await demoApi();
    const response = await api.put(
      `/api/questions/00000000-0000-4000-8000-000000000099/${endpoint}`,
      payload,
    );
    expect(response.statusCode).toBe(404);
  });

  it.each([{ rating: "bad" }, {}, { rating: 3 }, { rating: false }, { rating: [] }])(
    "rejects invalid rating body %j",
    async (payload) => {
      const api = await demoApi();
      const question = first(await api.questions());
      const response = await api.put(`/api/questions/${question.id}/rating`, payload);
      expect(response.statusCode).toBe(400);
    },
  );

  it.each([{}, { hidden: "bad" }, { hidden: "true" }, { hidden: null }, { hidden: 1 }])(
    "rejects invalid hidden body %j",
    async (payload) => {
      const api = await demoApi();
      const question = first(await api.questions());
      const response = await api.put(`/api/questions/${question.id}/hidden`, payload);
      expect(response.statusCode).toBe(400);
    },
  );

  it("serializes simultaneous demo requests and lists a single Target", async () => {
    const { server } = await startServer(await temporaryDirectory());
    const replies = await Promise.all(
      Array.from({ length: 5 }, async () =>
        server.inject({
          method: "POST",
          url: "/api/targets/demo",
          headers: browserHeaders(server),
        }),
      ),
    );
    const listed = await server.inject({ url: "/api/targets", headers: browserHeaders(server) });
    expect(
      replies.map((response) => response.statusCode).toSorted((left, right) => left - right),
    ).toStrictEqual([200, 200, 200, 200, 201]);
    expect(new Set(replies.map((response) => response.json<{ id: string }>().id)).size).toBe(1);
    expect(listed.json()).toStrictEqual([
      {
        id: first(replies).json<{ id: string }>().id,
        name: "Middle backend-разработчик на TypeScript",
        status: "active",
        level: "middle",
      },
    ]);
  });
});
