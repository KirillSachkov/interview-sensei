// Spec #45, seam 1, ticket #51: the Candidate's manual actions without the agent. A Section
// toggle, hiding a Question and a Question rating write at once, never through the draft of
// changes.
import { describe, expect, it } from "vitest";

import { agentTexts, isIdle, openEvents } from "./chat-test-support.ts";
import type { SessionView } from "./chat-test-support.ts";
import { demoApi, first } from "./model-test-support.ts";
import type { Questions, TargetView } from "./model-test-support.ts";

type Api = Awaited<ReturnType<typeof demoApi>>;

const unknownId = "00000000-0000-4000-8000-000000000099";

const toolAnswered = (view: SessionView) =>
  isIdle(view) && agentTexts(view).some((text) => text.startsWith("Результат update_target"));

/** Opens the Target's setup session and makes its agent record one change in the draft. */
async function draftWithOneChange(api: Api) {
  const opened = await api.server.inject({
    method: "POST",
    url: `/api/targets/${api.target.id}/setup-session`,
    headers: api.headers,
  });
  const events = await openEvents(api.server, opened.json<{ id: string }>().id);
  await events.waitFor(isIdle);
  events.send({ type: "prompt", text: '/tool update_target {"name":"Go"}' });
  await events.waitFor(toolAnswered);
}

async function targetOf(api: Api): Promise<TargetView> {
  const response = await api.get(`/api/targets/${api.target.id}`);
  return response.json<TargetView>();
}

function topicsOf(target: TargetView) {
  return target.sections.flatMap((section) => section.topics);
}

describe("section toggle", () => {
  it("switches a Section off and on at once", async () => {
    const api = await demoApi();
    const section = first(api.target.sections);
    const url = `/api/targets/${api.target.id}/sections/${section.id}/enabled`;

    const off = await api.put(url, { enabled: false });

    expect(off.statusCode).toBe(200);
    expect(off.json<TargetView>().sections.map((entry) => entry.enabled)).toStrictEqual([
      false,
      true,
      true,
    ]);
    await expect(targetOf(api)).resolves.toMatchObject({ sections: [{ enabled: false }, {}, {}] });
    const on = await api.put(url, { enabled: true });
    expect(first(on.json<TargetView>().sections).enabled).toBe(true);
  });

  it("refuses a Section of another Target or an unknown Target", async () => {
    const api = await demoApi();
    const section = first(api.target.sections);

    const foreign = await api.put(`/api/targets/${unknownId}/sections/${section.id}/enabled`, {
      enabled: false,
    });
    const unknown = await api.put(`/api/targets/${api.target.id}/sections/${unknownId}/enabled`, {
      enabled: false,
    });

    expect(foreign.statusCode).toBe(404);
    expect(foreign.json()).toStrictEqual({ error: "target_not_found" });
    expect(unknown.statusCode).toBe(404);
    expect(unknown.json()).toStrictEqual({ error: "section_not_found" });
  });

  it.each([{}, { enabled: "false" }, { enabled: null }, { enabled: false, extra: 1 }])(
    "rejects the toggle body %j",
    async (payload) => {
      const api = await demoApi();
      const section = first(api.target.sections);

      const response = await api.put(
        `/api/targets/${api.target.id}/sections/${section.id}/enabled`,
        payload,
      );

      expect(response.statusCode).toBe(400);
    },
  );
});

describe("questions of a Section", () => {
  it("lists the Questions of the Section's Topics", async () => {
    const api = await demoApi();
    const { id, topics } = first(api.target.sections.filter((entry) => entry.kind === "topics"));

    const response = await api.get(`/api/targets/${api.target.id}/questions?sectionId=${id}`);

    const questions = response.json<Questions>();
    expect(response.statusCode).toBe(200);
    expect(questions.length).toBeGreaterThan(0);
    expect(new Set(questions.map((question) => question.topicId))).toStrictEqual(
      new Set(topics.map((topic) => topic.id)),
    );
  });

  it("refuses an unknown Section", async () => {
    const api = await demoApi();

    const response = await api.get(
      `/api/targets/${api.target.id}/questions?sectionId=${unknownId}`,
    );

    expect(response.statusCode).toBe(404);
    expect(response.json()).toStrictEqual({ error: "section_not_found" });
  });

  it("counts only the visible Questions of each Topic", async () => {
    const api = await demoApi();
    const question = first(await api.questions());
    const before = first(topicsOf(api.target).filter((topic) => topic.id === question.topicId));

    await api.put(`/api/questions/${question.id}/hidden`, { hidden: true });

    const after = topicsOf(await targetOf(api)).filter((topic) => topic.id === question.topicId);
    expect(first(after).questionCount).toBe(before.questionCount - 1);
  });
});

describe("manual actions and the draft of changes", () => {
  it("writes a Section toggle, a hidden Question and a rating at once and leaves the draft alone", async () => {
    const api = await demoApi();
    await draftWithOneChange(api);
    const questions = await api.questions();
    const [hidden, rated] = questions.map((question) => question.id);

    await Promise.all([
      api.put(`/api/targets/${api.target.id}/sections/${first(api.target.sections).id}/enabled`, {
        enabled: false,
      }),
      api.put(`/api/questions/${String(hidden)}/hidden`, { hidden: true }),
      api.put(`/api/questions/${String(rated)}/rating`, { rating: "wrong" }),
    ]);

    await expect(targetOf(api)).resolves.toMatchObject({ sections: [{ enabled: false }, {}, {}] });
    await expect(api.questions("?hidden=true")).resolves.toMatchObject([{ id: hidden }]);
    await expect(api.questions()).resolves.toContainEqual(
      expect.objectContaining({ id: rated, rating: "wrong" }),
    );
    const draft = await api.get(`/api/targets/${api.target.id}/draft`);
    expect(draft.json()).toMatchObject({
      changes: [{ operation: { type: "update_target", name: "Go" } }],
    });
  });
});
