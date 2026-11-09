// Spec #45 with spec #41, seam 1: the draft of changes keeps the Candidate's progress. A Topic
// that the draft merges into another one hands over its Attempts, so the Topic status and
// «Готовность» count them under the Topic that stays.
import { describe, expect, it } from "vitest";

import { isIdle, openEvents } from "./chat-test-support.ts";
import { demoWithMock } from "./progress-test-support.ts";
import { api, applyDraft, callTool } from "./setup-test-support.ts";

type Api = Awaited<ReturnType<typeof demoWithMock>>;

/** The Topic status of each Topic of the plan, by name. */
async function statuses({ server, target }: Api) {
  const response = await api(server).get(`/api/targets/${target.id}/progress`);
  const { topics } = response.json<{ topics: { name: string; status: string }[] }>();
  return Object.fromEntries(topics.map((topic) => [topic.name, topic.status]));
}

/** The demo Target's setup session, once its agent takes prompts. */
async function setupOf({ server, target }: Api) {
  const opened = await api(server).post(`/api/targets/${target.id}/setup-session`);
  const events = await openEvents(server, opened.json<{ id: string }>().id);
  await events.waitFor(isIdle);
  return events;
}

const demoPlan = [
  { name: "Опыт и резюме", kind: "conversation" },
  { name: "TypeScript и Node.js", kind: "topics" },
  { name: "Проектирование", kind: "design" },
];

describe("progress after the draft of changes", () => {
  it("counts the Attempts of a merged Topic under the Topic it merged into", async () => {
    const mocked = await demoWithMock();
    const events = await setupOf(mocked);
    await callTool(events, "set_interview_plan", {
      sections: demoPlan,
      renameTopics: [{ from: "Опыт разработки", to: "Проектирование сервисов" }],
    });

    const response = await applyDraft(mocked.server, mocked.target.id);

    expect(response.statusCode).toBe(200);
    await expect(statuses(mocked)).resolves.toStrictEqual({
      "Проектирование сервисов": "shaky",
      "Система типов TypeScript": "not_started",
      "Асинхронность Node.js": "not_started",
      "Данные и надёжность": "not_started",
    });
  });
});
