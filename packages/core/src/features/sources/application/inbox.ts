// Inbox processing of each Target (spec #47): the proposal card, the start by the Candidate's
// button, the agent's work through its MCP tools and the Inbox report.
import { randomUUID } from "node:crypto";

import type { ToolSession } from "../../../shared/mcp/index.ts";
import type { InboxMode, InboxProposal, ProposalItem } from "../domain/inbox.ts";
import { sessionTarget } from "./inbox-context.ts";
import type { InboxContext, InboxDependencies } from "./inbox-context.ts";
import { endInterrupted, stop } from "./inbox-ending.ts";
import { start, startRecheck } from "./inbox-start.ts";
import { addBankQuestions } from "./inbox-add.ts";
import type { MaterialQuestion } from "./inbox-add.ts";
import { markSourceFailed, readSource } from "./inbox-materials.ts";
import { brief, createTopic, listInbox, writeReport } from "./inbox-work.ts";
import type { ReportInput } from "./inbox-work.ts";
import { inboxState, markReportSeen, reportList, reportView } from "./inbox-views.ts";

/** Stores an open proposal of the mode in place of the Target's open one of that mode. */
async function saveOpen(
  { dependencies }: InboxContext,
  { targetId, mode, items, reason }: Pick<InboxProposal, "targetId" | "mode" | "items" | "reason">,
): Promise<InboxProposal> {
  const proposal: InboxProposal = {
    id: randomUUID(),
    targetId,
    mode,
    items,
    reason,
    status: "open",
    createdAt: dependencies.clock.now().toISOString(),
  };
  await dependencies.inbox.saveProposal(proposal);
  return proposal;
}

/**
 * The setup agent's proposal: the card shows it in the chat. Only Sources of the Target that wait
 * in the Inbox can be proposed; nothing starts until the Candidate presses «Запустить разбор».
 */
async function propose(
  context: InboxContext,
  session: ToolSession,
  items: readonly ProposalItem[],
): Promise<InboxProposal> {
  const targetId = sessionTarget(session);
  const sources = await context.dependencies.repository.list(targetId);
  for (const { sourceId } of items) {
    const source = sources.find((candidate) => candidate.id === sourceId);
    if (source?.status !== "inbox") {
      throw new Error(`The Source ${sourceId} is not a material of this Target in the Inbox`);
    }
  }
  return saveOpen(context, { targetId, mode: "processing", items, reason: null });
}

/**
 * The setup agent's proposal to recheck the bank, such as after a new Preference: the card
 * «Перепроверка базы» shows it in the chat; only the Candidate's button starts the recheck.
 */
async function proposeRecheck(
  context: InboxContext,
  session: ToolSession,
  reason: string,
): Promise<InboxProposal> {
  const targetId = sessionTarget(session);
  const bank = await context.dependencies.questions.questions(targetId);
  if (!bank.some((question) => !question.hidden)) {
    throw new Error("The Target has no visible Questions to recheck");
  }
  return saveOpen(context, { targetId, mode: "recheck", items: [], reason });
}

export function createInbox(dependencies: InboxDependencies) {
  const context: InboxContext = { dependencies, pending: new Set() };
  return {
    propose: async (session: ToolSession, items: readonly ProposalItem[]) =>
      propose(context, session, items),
    proposeRecheck: async (session: ToolSession, reason: string) =>
      proposeRecheck(context, session, reason),
    /**
     * «Не сейчас» on the card of the mode: the materials stay in the Inbox, the bank stays
     * unchecked; false when the Target has no open proposal of the mode.
     */
    dismiss: async (targetId: string, mode: InboxMode = "processing") =>
      dependencies.inbox.closeProposal(targetId, { status: "dismissed", mode }),
    start: async (request: { targetId: string; sourceIds?: readonly string[] | undefined }) =>
      start(context, request),
    /** «Запустить перепроверку»: a recheck of the Target's bank. */
    startRecheck: async (targetId: string) => startRecheck(context, targetId),
    /** The history of the Target's reports, the newest first; null for an unknown Target. */
    reports: async (targetId: string) => reportList(context, targetId),
    /** «Остановить разбор»: a partial report, the unread materials back in the Inbox. */
    stop: async (targetId: string) => stop(context, targetId),
    /** Closes the runs of the last start of the server with partial reports; call it at start. */
    endInterrupted: async () => endInterrupted(context),
    state: async (targetId: string) => inboxState(context, targetId),
    /** The report for its panel; `onlyNew` keeps the added Questions the Candidate has not seen. */
    report: async (targetId: string, reportId: string, { onlyNew = false } = {}) =>
      reportView(context, { targetId, reportId, onlyNew }),
    /** «просмотрено» of the report's Questions; false for an unknown report. */
    markSeen: async (targetId: string, reportId: string) =>
      markReportSeen(context, { targetId, reportId }),
    brief: async (session: ToolSession) => brief(context, session),
    listInbox: async (session: ToolSession) => listInbox(context, session),
    readSource: async (session: ToolSession, part: { id: string; part: number }) =>
      readSource(context, session, part),
    addBankQuestions: async (session: ToolSession, questions: readonly MaterialQuestion[]) =>
      addBankQuestions(context, session, questions),
    createTopic: async (session: ToolSession, topic: { sectionId: string; name: string }) =>
      createTopic(context, session, topic),
    markSourceFailed: async (session: ToolSession, failure: { id: string; reason: string }) =>
      markSourceFailed(context, session, failure),
    writeReport: async (session: ToolSession, report: ReportInput) =>
      writeReport(context, session, report),
    /** Waits for the background work of started runs; the server calls it before it closes. */
    settle: async () => {
      await Promise.allSettled(context.pending);
    },
  };
}
export type Inbox = ReturnType<typeof createInbox>;
