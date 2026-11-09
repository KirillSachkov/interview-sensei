// Helpers of the API tests of the Target setup: a new draft Target with its setup session, and the
// fake agent's `/tool <name> <json>`, which stands for the agent's calls of our MCP tools.
import type { FastifyInstance } from "fastify";
import { expect } from "vitest";

import { agentTexts, browserHeaders, isIdle, openEvents } from "./chat-test-support.ts";
import type { SessionView } from "./chat-test-support.ts";
import type { Questions, TargetView } from "./model-test-support.ts";

export type Events = Awaited<ReturnType<typeof openEvents>>;

const lastAgentText = (view: SessionView) => agentTexts(view).at(-1) ?? "";

/** The page's requests to the server's HTTP API. */
export function api(server: FastifyInstance) {
  const headers = browserHeaders(server);
  return {
    get: async (url: string) => server.inject({ url, headers }),
    post: async (url: string) => server.inject({ method: "POST", url, headers }),
    put: async (url: string, payload: object) =>
      server.inject({ method: "PUT", url, headers, payload }),
    delete: async (url: string) => server.inject({ method: "DELETE", url, headers }),
  };
}

/** A new draft Target from «Новая цель». */
async function newTarget(server: FastifyInstance): Promise<TargetView> {
  const response = await api(server).post("/api/targets");
  expect(response.statusCode).toBe(201);
  return response.json<TargetView>();
}

/** Opens the Target's setup session and its events, once the agent takes prompts. */
export async function openSetup(server: FastifyInstance, targetId: string) {
  const opened = await api(server).post(`/api/targets/${targetId}/setup-session`);
  expect(opened.statusCode).toBeLessThan(300);
  const session = opened.json<{ id: string }>();
  const events = await openEvents(server, session.id);
  // A draft Target's session starts with the onboarding: wait for the agent's answer to it.
  await events.waitFor((view) => isIdle(view) && agentTexts(view).length > 0);
  return { session, events };
}

/** A new draft Target with its setup session. */
export async function setupChat(server: FastifyInstance) {
  const target = await newTarget(server);
  return { target, ...(await openSetup(server, target.id)) };
}

/** Sends `/tool <name> <json>` and resolves with the fake agent's reply to it. */
export async function callTool(events: Events, name: string, args: object = {}): Promise<string> {
  const before = agentTexts(
    events.views.at(-1) ?? { id: "", status: "", entries: [], failure: null },
  );
  events.send({ type: "prompt", text: `/tool ${name} ${JSON.stringify(args)}` });
  const answered = await events.waitFor(
    (view) =>
      isIdle(view) &&
      agentTexts(view).length > before.length &&
      /^(?:Результат|Ошибка) /u.test(lastAgentText(view)),
  );
  return lastAgentText(answered);
}

/** The JSON result of the tool; fails on the tool's error. */
export async function toolResult(events: Events, name: string, args: object = {}) {
  const reply = await callTool(events, name, args);
  const prefix = `Результат ${name}: `;
  expect(reply.slice(0, prefix.length)).toBe(prefix);
  const result: unknown = JSON.parse(reply.slice(prefix.length));
  return result;
}

export async function targetOf(server: FastifyInstance, id: string): Promise<TargetView> {
  const response = await api(server).get(`/api/targets/${id}`);
  return response.json<TargetView>();
}

export interface DraftChange {
  readonly id: string;
  readonly operation: { readonly type: string };
}

export async function draftOf(server: FastifyInstance, id: string): Promise<DraftChange[]> {
  const response = await api(server).get(`/api/targets/${id}/draft`);
  return response.json<{ changes: DraftChange[] }>().changes;
}

/** «Применить»: the response of the draft's application. */
export async function applyDraft(server: FastifyInstance, id: string) {
  return api(server).post(`/api/targets/${id}/draft/apply`);
}

/** The Target's Questions, hidden or not, as the side panel lists them. */
export async function questionsOf(
  server: FastifyInstance,
  id: string,
  query = "",
): Promise<Questions> {
  const response = await api(server).get(`/api/targets/${id}/questions${query}`);
  return response.json<Questions>();
}

export const setupPlan = {
  sections: [
    { name: "Опыт", kind: "conversation", topics: [] },
    {
      name: "Go",
      kind: "topics",
      gradingCriteria: "Модель памяти",
      topics: ["Горутины", "Каналы"],
    },
    { name: "Проектирование", kind: "design", topics: ["Kafka"] },
  ],
};

export const setupQuestions = [
  { topic: "Горутины", text: "Что такое горутина?" },
  { topic: "Каналы", text: "Чем буферизованный канал отличается от небуферизованного?" },
  { topic: "Kafka", text: "Как Kafka хранит смещения?" },
];

/** An active Target with the plan and its Questions, applied by «Применить». */
export async function appliedTarget(server: FastifyInstance) {
  const { target, events } = await setupChat(server);
  await callTool(events, "update_target", { name: "Go-разработчик", level: "middle" });
  await callTool(events, "set_interview_plan", setupPlan);
  await callTool(events, "add_questions", { questions: setupQuestions });
  const response = await applyDraft(server, target.id);
  expect(response.statusCode).toBe(200);
  return { target: response.json<TargetView>(), events };
}

/** Records the agent's tool call and applies the draft by «Применить». */
export async function applied(
  { server, events, targetId }: { server: FastifyInstance; events: Events; targetId: string },
  [tool, args]: [string, object],
): Promise<TargetView> {
  await expect(callTool(events, tool, args)).resolves.toMatch(/^Результат /u);
  const response = await applyDraft(server, targetId);
  expect(response.statusCode).toBe(200);
  return response.json<TargetView>();
}
