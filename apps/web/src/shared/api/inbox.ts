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

/**
 * The Target's Inbox processing: the open proposal of the setup chat, the running processing, the
 * latest Inbox report and how many materials wait in the Inbox.
 */
export interface InboxState {
  readonly proposal: {
    readonly id: string;
    readonly createdAt: string;
    readonly items: readonly ProposalItem[];
  } | null;
  readonly run: { readonly id: string; readonly sourceIds: readonly string[] } | null;
  readonly latestReport: { readonly id: string; readonly createdAt: string } | null;
  readonly unprocessed: number;
}

export type SectionKind = "conversation" | "topics" | "design";

/** The Inbox report as its panel shows it. */
export interface InboxReport {
  readonly id: string;
  readonly partial: boolean;
  readonly createdAt: string;
  readonly summary: string;
  readonly duplicates: number;
  readonly added: number;
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
      readonly questions: readonly {
        readonly id: string;
        readonly text: string;
        readonly level: "junior" | "middle" | "senior";
        readonly hidden: boolean;
      }[];
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

/** «Не сейчас»: the card closes and the materials stay in the Inbox. */
export async function dismissInboxProposal(targetId: string): Promise<void> {
  await request(`${inboxUrl(targetId)}/proposal/dismiss`, { method: "POST" });
}

export async function fetchInboxReport(targetId: string, reportId: string): Promise<InboxReport> {
  const body = await request(
    `/api/targets/${encodeURIComponent(targetId)}/inbox-reports/${encodeURIComponent(reportId)}`,
  );
  if (!isInboxReport(body)) {
    throw new Error("неожиданный ответ");
  }
  return body;
}
