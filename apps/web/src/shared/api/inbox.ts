import { isObject } from "./http";
import { request } from "./request";
import type { SourceType } from "./sources";

/** One material of the proposal card: its type and size from the server, the agent's assessment. */
export interface ProposalItem {
  readonly sourceId: string;
  readonly type: SourceType;
  readonly title: string;
  readonly url: string | null;
  /** The file's size in bytes; null for a link. */
  readonly size: number | null;
  readonly assessment: string;
}

/** `processing` reads materials; `recheck` checks the bank against the Preferences. */
type InboxMode = "processing" | "recheck";

/**
 * The Target's Inbox processing: the open proposals of the setup chat, the running processing or
 * recheck, the latest Inbox report and how many materials wait in the Inbox.
 */
export interface InboxState {
  readonly proposal: {
    readonly id: string;
    readonly createdAt: string;
    readonly items: readonly ProposalItem[];
  } | null;
  /** The card «Перепроверка базы» with the setup agent's reason. */
  readonly recheckProposal: {
    readonly id: string;
    readonly createdAt: string;
    readonly reason: string;
  } | null;
  readonly run: {
    readonly id: string;
    readonly mode: InboxMode;
    readonly sourceIds: readonly string[];
  } | null;
  readonly latestReport: {
    readonly id: string;
    readonly mode: InboxMode;
    readonly createdAt: string;
  } | null;
  readonly unprocessed: number;
}

type SectionKind = "conversation" | "topics" | "design";

/** A Question of the report with the marks the Candidate reviews it by. */
export interface ReportQuestion {
  readonly id: string;
  readonly text: string;
  readonly level: "junior" | "middle" | "senior";
  readonly sectionKind: SectionKind | null;
  readonly hidden: boolean;
  /** «не подтверждён»: an agent made it up without a material. */
  readonly unconfirmed: boolean;
  /** «новый»: the Candidate has not seen it. */
  readonly unseen: boolean;
  readonly rating: "useful" | "irrelevant" | "wrong" | null;
  readonly ratingComment: string | null;
  /** The material the Question came from and its part; null for a made-up Question. */
  readonly source: {
    readonly id: string;
    readonly title: string;
    readonly part: number | null;
  } | null;
  readonly referenceAnswer: ReferenceAnswer | null;
}

/** The reference answer of a Question: key points, a short sample, its origin and part. */
export interface ReferenceAnswer {
  readonly points: readonly string[];
  readonly sample: string;
  readonly origin: "material" | "internet" | "agent" | "candidate";
  readonly part: number | null;
}

/** A Question of the list «скрыть?» of a recheck. */
export interface HideProposal {
  readonly questionId: string;
  readonly text: string;
  readonly topic: string;
  readonly reason: string;
  readonly hidden: boolean;
}

/** The Inbox report as its panel shows it. */
export interface InboxReport {
  readonly id: string;
  readonly mode: InboxMode;
  readonly partial: boolean;
  readonly createdAt: string;
  readonly summary: string;
  readonly duplicates: number;
  readonly added: number;
  /** How many added Questions the Candidate has not seen. */
  readonly newQuestions: number;
  readonly sources: readonly {
    readonly id: string;
    readonly type: SourceType;
    readonly title: string;
    readonly status: "inbox" | "processing" | "ready" | "failed";
    readonly failure: string | null;
  }[];
  readonly sections: readonly {
    readonly id: string | null;
    readonly name: string;
    readonly topics: readonly {
      readonly id: string;
      readonly name: string;
      readonly questions: readonly ReportQuestion[];
    }[];
  }[];
  readonly doubtful: readonly { readonly text: string; readonly reason: string }[];
  readonly proposals: {
    readonly sections: readonly {
      readonly name: string;
      readonly kind: SectionKind;
      readonly reason: string;
    }[];
    readonly preferences: readonly { readonly text: string; readonly reason: string }[];
  };
  readonly toHide: readonly HideProposal[];
}

/** A report of the history. */
export interface ReportSummary {
  readonly id: string;
  readonly mode: InboxMode;
  readonly partial: boolean;
  readonly createdAt: string;
  readonly added: number;
  readonly toHide: number;
}

function inboxUrl(targetId: string): string {
  return `/api/targets/${encodeURIComponent(targetId)}/inbox`;
}

function isInboxState(value: unknown): value is InboxState {
  return isObject(value) && "proposal" in value && "run" in value && "unprocessed" in value;
}

function isInboxReport(value: unknown): value is InboxReport {
  return (
    isObject(value) &&
    typeof value.id === "string" &&
    typeof value.summary === "string" &&
    Array.isArray(value.sections) &&
    Array.isArray(value.sources)
  );
}

export async function fetchInbox(targetId: string): Promise<InboxState> {
  const body = await request(inboxUrl(targetId));
  if (!isInboxState(body)) {
    throw new Error("неожиданный ответ");
  }
  return body;
}

/**
 * «Запустить разбор»: the chosen materials, or every material in the Inbox without a choice.
 * Throws the server's Russian message, such as for a running processing.
 */
export async function startInboxProcessing(
  targetId: string,
  sourceIds?: readonly string[],
): Promise<void> {
  await request(`${inboxUrl(targetId)}/processing`, {
    method: "POST",
    body: sourceIds === undefined ? {} : { sourceIds },
  });
}

/**
 * «Остановить разбор»: the server closes the processing with a partial report; the unread materials
 * go back to the Inbox. Throws the server's Russian message when no processing runs.
 */
export async function stopInboxProcessing(targetId: string): Promise<void> {
  await request(`${inboxUrl(targetId)}/processing/stop`, { method: "POST" });
}

/** «Не сейчас»: the card closes and the materials stay in the Inbox. */
export async function dismissInboxProposal(targetId: string): Promise<void> {
  await request(`${inboxUrl(targetId)}/proposal/dismiss`, { method: "POST" });
}

function reportUrl(targetId: string, reportId: string): string {
  return `/api/targets/${encodeURIComponent(targetId)}/inbox-reports/${encodeURIComponent(reportId)}`;
}

/** The report; `onlyNew` keeps the added Questions the Candidate has not seen. */
export async function fetchInboxReport(
  targetId: string,
  reportId: string,
  onlyNew = false,
): Promise<InboxReport> {
  const body = await request(`${reportUrl(targetId, reportId)}${onlyNew ? "?new=true" : ""}`);
  if (!isInboxReport(body)) {
    throw new Error("неожиданный ответ");
  }
  return body;
}

/** «Отметить просмотренными»: the report's Questions are no longer «новый». */
export async function markReportSeen(targetId: string, reportId: string): Promise<void> {
  await request(`${reportUrl(targetId, reportId)}/seen`, { method: "POST" });
}

function isReportList(value: unknown): value is ReportSummary[] {
  return (
    Array.isArray(value) &&
    value.every((item: unknown) => isObject(item) && typeof item.id === "string")
  );
}

/** The history of the Target's reports, the newest first. */
export async function fetchInboxReports(targetId: string): Promise<ReportSummary[]> {
  const body = await request(`/api/targets/${encodeURIComponent(targetId)}/inbox-reports`);
  if (!isReportList(body)) {
    throw new Error("неожиданный ответ");
  }
  return body;
}

/** «Запустить перепроверку»; throws the server's Russian message, such as for a running one. */
export async function startRecheck(targetId: string): Promise<void> {
  await request(`${inboxUrl(targetId)}/recheck`, { method: "POST" });
}

/** «Не сейчас» on the card «Перепроверка базы». */
export async function dismissRecheckProposal(targetId: string): Promise<void> {
  await request(`${inboxUrl(targetId)}/recheck-proposal/dismiss`, { method: "POST" });
}

/** What the Candidate does with the chosen Questions. */
export type ReviewAction = "hide" | "delete" | "warn" | "confirm";

/**
 * The bulk review of the Target's Questions: hide, delete (a Question with Attempts is hidden
 * instead), ⚠ with the comment, 👍.
 */
export async function reviewQuestions(
  targetId: string,
  review: { action: ReviewAction; questionIds: readonly string[]; comment?: string },
): Promise<void> {
  await request(`/api/targets/${encodeURIComponent(targetId)}/questions/review`, {
    method: "POST",
    body: review,
  });
}
