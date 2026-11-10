// Helpers of the API tests of answer search (#70): «Найти ответы», the state of the «Цель» zone, the
// report, and the answer search's session, which the fake agent's `/tool` drives when the Target's
// name has `[manual]`.
import type { FastifyInstance } from "fastify";
import { expect, vi } from "vitest";

import { agentTexts, browserHeaders, isIdle, openEvents } from "./chat-test-support.ts";
import { processedVacancy, sessionEnded } from "./inbox-test-support.ts";
import type { TargetView } from "./model-test-support.ts";
import {
  api,
  applyDraft,
  callTool,
  questionsOf,
  setupChat,
  setupPlan,
  setupQuestions,
  toolResult,
} from "./setup-test-support.ts";
import type { Events } from "./setup-test-support.ts";

/** The start window's numbers, the search that waits or runs and the latest report. */
export interface AnswerState {
  readonly withoutAnswer: number;
  readonly queued: number;
  readonly run: {
    readonly id: string;
    readonly status: "waiting" | "running";
    readonly filled: number;
    readonly total: number;
  } | null;
  readonly latestReport: { readonly id: string; readonly partial: boolean } | null;
}

export async function answersOf(server: FastifyInstance, targetId: string): Promise<AnswerState> {
  const response = await api(server).get(`/api/targets/${targetId}/answers`);
  expect(response.statusCode).toBe(200);
  return response.json<AnswerState>();
}

/** «Найти ответы» for up to `count` Questions. */
export async function startSearch(server: FastifyInstance, targetId: string, count: number) {
  return server.inject({
    method: "POST",
    url: `/api/targets/${targetId}/answers/search`,
    headers: browserHeaders(server),
    payload: { count },
  });
}

/** «Остановить». */
export async function stopSearch(server: FastifyInstance, targetId: string) {
  return server.inject({
    method: "POST",
    url: `/api/targets/${targetId}/answers/search/stop`,
    headers: browserHeaders(server),
  });
}

export interface AnswerReportView {
  readonly id: string;
  readonly partial: boolean;
  readonly summary: string;
  readonly total: number;
  readonly filled: number;
  readonly internet: number;
  readonly agent: number;
  readonly questions: readonly { questionId: string; text: string; origin: string }[];
  readonly failed: readonly { questionId: string; text: string; reason: string | null }[];
  readonly usage: {
    readonly tokens: number;
    readonly cost: { readonly amount: number; readonly currency: string } | null;
  } | null;
}

export async function answerReportOf(
  server: FastifyInstance,
  targetId: string,
  reportId: string,
): Promise<AnswerReportView> {
  const response = await api(server).get(`/api/targets/${targetId}/answer-reports/${reportId}`);
  expect(response.statusCode).toBe(200);
  return response.json<AnswerReportView>();
}

/** The Target's latest answer report once the search has ended. */
export async function latestAnswerReport(
  server: FastifyInstance,
  targetId: string,
): Promise<AnswerReportView> {
  const reportId = await vi.waitFor(
    async () => {
      const state = await answersOf(server, targetId);
      expect(state.run).toBeNull();
      const id = state.latestReport?.id;
      if (id === undefined) {
        throw new Error("The answer search has written no report yet");
      }
      return id;
    },
    { timeout: 15_000, interval: 100 },
  );
  return answerReportOf(server, targetId, reportId);
}

interface SessionSummary {
  readonly id: string;
  readonly kind: string;
  readonly targetId?: string | null;
}

/** The Target's answer search sessions, the newest first. */
export async function searchSessions(
  server: FastifyInstance,
  targetId: string,
): Promise<SessionSummary[]> {
  const response = await api(server).get("/api/sessions");
  return response
    .json<SessionSummary[]>()
    .filter((session) => session.kind === "answer-search" && session.targetId === targetId);
}

/**
 * The events of the Target's answer search session after the fake researcher's first turn: with
 * `[manual]` in the Target's name it waits there for `/tool` commands.
 */
export async function searchEvents(server: FastifyInstance, targetId: string) {
  const session = await vi.waitFor(
    async () => {
      const [found] = await searchSessions(server, targetId);
      if (found === undefined) {
        throw new Error("The answer search session has not started yet");
      }
      return found;
    },
    { timeout: 10_000, interval: 50 },
  );
  const events = await openEvents(server, session.id);
  await events.waitFor(
    (view) => isIdle(view) && agentTexts(view).some((text) => text.endsWith("Жду команд.")),
  );
  return { session, events };
}

/**
 * An active Target named «Go [manual]» with the plan and Questions of setupPlan, none of them with
 * a reference answer, applied by «Применить».
 */
export async function manualTarget(server: FastifyInstance) {
  const { target, events } = await setupChat(server);
  await callTool(events, "update_target", { name: "Go [manual]", level: "middle" });
  await callTool(events, "set_interview_plan", setupPlan);
  await callTool(events, "add_questions", { questions: setupQuestions });
  const response = await applyDraft(server, target.id);
  expect(response.statusCode).toBe(200);
  return { target: response.json<TargetView>(), setup: events };
}

/** A `[manual]` Target with a running answer search of every Question, its agent waiting for `/tool`. */
export async function manualSearch(server: FastifyInstance) {
  const { target, setup } = await manualTarget(server);
  const started = await startSearch(server, target.id, 20);
  expect(started.statusCode).toBe(202);
  const { session, events } = await searchEvents(server, target.id);
  return { target, setup, session, events };
}

/** A Question as next_questions_without_answer hands it out. */
export interface Handed {
  readonly id: string;
  readonly text: string;
  readonly topic: string;
  readonly level: string;
  readonly sectionKind: string | null;
  readonly currentOrigin: string | null;
}

function isHanded(value: unknown): value is Handed {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof Reflect.get(value, "id") === "string" &&
    typeof Reflect.get(value, "text") === "string"
  );
}

interface Batch {
  readonly questions: Handed[];
  readonly left: number;
  readonly total: number;
}

function isBatch(value: unknown): value is Batch {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const questions: unknown = Reflect.get(value, "questions");
  return (
    Array.isArray(questions) &&
    questions.every((question) => isHanded(question)) &&
    typeof Reflect.get(value, "left") === "number" &&
    typeof Reflect.get(value, "total") === "number"
  );
}

/** next_questions_without_answer: the next `count` Questions of the run's queue. */
export async function handOut(events: Events, count = 5): Promise<Batch> {
  const result = await toolResult(events, "next_questions_without_answer", { count });
  if (!isBatch(result)) {
    throw new TypeError("The result is not a batch of Questions");
  }
  return result;
}

/** The id of the Question with the text among the handed ones. */
export function idOf(questions: readonly Handed[], text: string): string {
  const found = questions.find((question) => question.text === text);
  if (found === undefined) {
    throw new Error(`No handed Question «${text}»`);
  }
  return found.id;
}

/** The Question of the Target's bank by id, with its reference answer. */
export async function bankQuestion(server: FastifyInstance, targetId: string, id: string) {
  const bank = await questionsOf(server, targetId);
  const found = bank.find((question) => question.id === id);
  if (found === undefined) {
    throw new Error(`No Question ${id}`);
  }
  return found;
}

/** The reportId of a write_answer_report result. */
export function reportIdOf(result: unknown): string {
  const id: unknown =
    typeof result === "object" && result !== null ? Reflect.get(result, "reportId") : undefined;
  if (typeof id !== "string") {
    throw new TypeError("The result has no reportId");
  }
  return id;
}

/** An answer «из интернета» with a source, as an agent writes it. */
export function internetAnswer(questionId: string) {
  return {
    questionId,
    points: ["Первый пункт", "Второй пункт", "Третий пункт"],
    sample: "Короткий образец ответа.",
    origin: "internet",
    links: ["https://go.dev/doc/effective_go"],
  };
}

/** An answer «из знаний агента», without a source. */
export function agentAnswer(questionId: string) {
  return { ...internetAnswer(questionId), origin: "agent", links: [] };
}

/**
 * The agent's background work on the Target: a vacancy processed to its Inbox report, then an answer
 * search of one Question to its report; both sessions have ended.
 */
export async function backgroundWork(
  server: FastifyInstance,
  { setup, targetId }: { setup: Events; targetId: string },
) {
  await processedVacancy(server, { setup, targetId });
  await startSearch(server, targetId, 1);
  await latestAnswerReport(server, targetId);
  const [search] = await searchSessions(server, targetId);
  if (search === undefined) {
    throw new Error("The answer search started no session");
  }
  await sessionEnded(server, search);
}
