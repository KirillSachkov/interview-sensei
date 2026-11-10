import { isObject, request } from "./http";

/**
 * The Target's answer search: `withoutAnswer` Questions without a reference answer, `queued` in the
 * queue, the search that waits for the Inbox processing or runs, and the latest report.
 */
export interface AnswerState {
  readonly withoutAnswer: number;
  readonly queued: number;
  readonly run: {
    readonly id: string;
    readonly status: "waiting" | "running";
    readonly filled: number;
    readonly total: number;
  } | null;
  readonly latestReport: {
    readonly id: string;
    readonly partial: boolean;
    readonly createdAt: string;
  } | null;
}

/**
 * The start window's numbers, as the server has them (`defaultSearchCount` and `maxSearchCount`
 * of answer search): 20 Questions by default, at most 200, since each costs about one web search.
 */
export const answerSearchCounts = { default: 20, max: 200 } as const;

/** The origins answer search writes: with a web source, or from the agent's own knowledge. */
type SearchOrigin = "internet" | "agent";

/** The answer report as its panel shows it. */
export interface AnswerReport {
  readonly id: string;
  readonly partial: boolean;
  readonly summary: string;
  readonly total: number;
  readonly filled: number;
  readonly internet: number;
  readonly agent: number;
  readonly questions: readonly {
    readonly questionId: string;
    readonly text: string;
    readonly origin: SearchOrigin;
  }[];
  readonly failed: readonly {
    readonly questionId: string;
    readonly text: string;
    readonly reason: string | null;
  }[];
  /**
   * The agent's latest ACP usage_update: the tokens in its context, its context window when known
   * and the session's cumulative cost; null when it did not report it.
   */
  readonly usage: {
    readonly contextTokens: number;
    readonly contextSize: number | null;
    readonly cost: { readonly amount: number; readonly currency: string } | null;
  } | null;
  readonly createdAt: string;
}

function answersUrl(targetId: string): string {
  return `/api/targets/${encodeURIComponent(targetId)}/answers`;
}

function isAnswerState(value: unknown): value is AnswerState {
  return isObject(value) && typeof value.withoutAnswer === "number" && "run" in value;
}

function isAnswerReport(value: unknown): value is AnswerReport {
  return (
    isObject(value) &&
    typeof value.id === "string" &&
    typeof value.summary === "string" &&
    Array.isArray(value.questions) &&
    Array.isArray(value.failed)
  );
}

export async function fetchAnswers(targetId: string): Promise<AnswerState> {
  const body = await request(answersUrl(targetId));
  if (!isAnswerState(body)) {
    throw new Error("неожиданный ответ");
  }
  return body;
}

/**
 * «Найти ответы» for up to `count` Questions. Throws the server's Russian message, such as for an
 * unavailable agent.
 */
export async function startAnswerSearch(targetId: string, count: number): Promise<void> {
  await request(`${answersUrl(targetId)}/search`, { method: "POST", body: { count } });
}

/** «Остановить»: the server closes the search with a partial report; the answers stay. */
export async function stopAnswerSearch(targetId: string): Promise<void> {
  await request(`${answersUrl(targetId)}/search/stop`, { method: "POST" });
}

export async function fetchAnswerReport(targetId: string, reportId: string): Promise<AnswerReport> {
  const body = await request(
    `/api/targets/${encodeURIComponent(targetId)}/answer-reports/${encodeURIComponent(reportId)}`,
  );
  if (!isAnswerReport(body)) {
    throw new Error("неожиданный ответ");
  }
  return body;
}
