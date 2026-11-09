// Progress, the summary Debrief, Disputes and the session history of the server (#54).

/** «не начато», «шатко» or «уверенно». */
export type TopicStatus = "not_started" | "shaky" | "confident";

export interface TopicProgress {
  readonly id: string;
  readonly name: string;
  readonly status: TopicStatus;
  /** An enabled Section checks the Topic. */
  readonly enabled: boolean;
  readonly sectionIds: readonly string[];
}

/** The Readiness: how many Topics of the enabled Sections have each Topic status. */
export interface TargetProgress {
  readonly readiness: {
    readonly confident: number;
    readonly shaky: number;
    readonly notStarted: number;
    readonly total: number;
  };
  readonly topics: readonly TopicProgress[];
  /** The Topics «подтянуть в первую очередь». */
  readonly focus: readonly TopicProgress[];
}

/** The summary Debrief of a Mock interview. */
export interface InterviewSummary {
  readonly status: "running" | "finished" | "interrupted";
  /** Null when the agent wrote no summary. */
  readonly summary: string | null;
  readonly nextStep: string | null;
  readonly answered: number;
  readonly unanswered: number;
  readonly topicChanges: readonly {
    readonly id: string;
    readonly name: string | null;
    readonly before: TopicStatus;
    readonly after: TopicStatus;
  }[];
}

/** A Mock interview as a collapsed card of the session history. */
export interface SessionSummary {
  readonly id: string;
  readonly status: "running" | "finished" | "interrupted";
  readonly startedAt: string;
  readonly finishedAt: string | null;
  readonly sectionIds: readonly string[];
  readonly questionCount: number;
  readonly answeredCount: number;
  /** Null while it runs or without Attempts. */
  readonly averageGrade: number | null;
}

export interface HistoryPage {
  readonly items: readonly SessionSummary[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
}

/** The filters of the session history: `from` inclusive and `to` exclusive, as ISO 8601. */
export interface HistoryFilter {
  readonly from?: string;
  readonly to?: string;
  readonly sectionId?: string;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** The server builds these bodies; the web app checks only that it got one. */
const isProgress = (value: unknown): value is TargetProgress =>
  isObject(value) && isObject(value.readiness) && Array.isArray(value.topics);
const isSummary = (value: unknown): value is InterviewSummary =>
  isObject(value) && typeof value.status === "string" && Array.isArray(value.topicChanges);
const isHistoryPage = (value: unknown): value is HistoryPage =>
  isObject(value) && Array.isArray(value.items) && typeof value.total === "number";

async function checked<Value>(
  response: Response,
  check: (value: unknown) => value is Value,
): Promise<Value> {
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(
      isObject(body) && typeof body.message === "string" ? body.message : `HTTP ${response.status}`,
    );
  }
  if (!check(body)) {
    throw new Error("неожиданный ответ");
  }
  return body;
}

const path = (value: string) => encodeURIComponent(value);

export async function fetchProgress(targetId: string): Promise<TargetProgress> {
  return checked(await fetch(`/api/targets/${path(targetId)}/progress`), isProgress);
}

export async function fetchInterviewSummary(interviewId: string): Promise<InterviewSummary> {
  return checked(await fetch(`/api/interviews/${path(interviewId)}/summary`), isSummary);
}

/** One page of the session history, from 1, the newest Mock interview first. */
export async function fetchHistory(
  targetId: string,
  { page, ...filter }: HistoryFilter & { page: number },
): Promise<HistoryPage> {
  const query = new URLSearchParams({ page: String(page) });
  for (const [key, value] of Object.entries(filter)) {
    if (typeof value === "string" && value !== "") {
      query.set(key, value);
    }
  }
  return checked(
    await fetch(`/api/targets/${path(targetId)}/interviews/history?${query.toString()}`),
    isHistoryPage,
  );
}

/** Corrects the Grade of the Attempt; the error says in Russian what to fix. */
export async function disputeGrade(
  interviewId: string,
  { attemptId, grade, reason }: { attemptId: string; grade: number; reason: string },
): Promise<unknown> {
  const response = await fetch(
    `/api/interviews/${path(interviewId)}/attempts/${path(attemptId)}/dispute`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ grade, reason }),
    },
  );
  return checked(response, isObject);
}
