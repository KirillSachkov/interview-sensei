// Inbox processing of each Target (spec #47): the proposal card, the start by the Candidate's
// button, the agent's work through its MCP tools and the Inbox report.
import { randomUUID } from "node:crypto";

import type { ToolSession } from "../../../shared/mcp/index.ts";
import type { InboxProposal, ProposalItem } from "../domain/inbox.ts";
import { sessionTarget } from "./inbox-context.ts";
import type { InboxContext, InboxDependencies } from "./inbox-context.ts";
import { start } from "./inbox-start.ts";
import {
  addBankQuestions,
  brief,
  createTopic,
  listInbox,
  readSource,
  writeReport,
} from "./inbox-work.ts";
import type { MaterialQuestion, ReportInput } from "./inbox-work.ts";
import { inboxState, reportView } from "./inbox-views.ts";

/**
 * The setup agent's proposal: the card shows it in the chat. Only Sources of the Target that wait
 * in the Inbox can be proposed; nothing starts until the Candidate presses «Запустить разбор».
 */
async function propose(
  { dependencies }: InboxContext,
  session: ToolSession,
  items: readonly ProposalItem[],
): Promise<InboxProposal> {
  const targetId = sessionTarget(session);
  const sources = await dependencies.repository.list(targetId);
  for (const { sourceId } of items) {
    const source = sources.find((candidate) => candidate.id === sourceId);
    if (source?.status !== "inbox") {
      throw new Error(`The Source ${sourceId} is not a material of this Target in the Inbox`);
    }
  }
  const proposal: InboxProposal = {
    id: randomUUID(),
    targetId,
    items,
    status: "open",
    createdAt: dependencies.clock.now().toISOString(),
  };
  await dependencies.inbox.saveProposal(proposal);
  return proposal;
}

export function createInbox(dependencies: InboxDependencies) {
  const context: InboxContext = { dependencies, pending: new Set() };
  return {
    propose: async (session: ToolSession, items: readonly ProposalItem[]) =>
      propose(context, session, items),
    /** «Не сейчас»: the materials stay in the Inbox; false when the Target has no open proposal. */
    dismiss: async (targetId: string) => dependencies.inbox.closeProposal(targetId, "dismissed"),
    start: async (request: { targetId: string; sourceIds?: readonly string[] | undefined }) =>
      start(context, request),
    state: async (targetId: string) => inboxState(context, targetId),
    report: async (targetId: string, reportId: string) => reportView(context, targetId, reportId),
    brief: async (session: ToolSession) => brief(context, session),
    listInbox: async (session: ToolSession) => listInbox(context, session),
    readSource: async (session: ToolSession, part: { id: string; part: number }) =>
      readSource(context, session, part),
    addBankQuestions: async (session: ToolSession, questions: readonly MaterialQuestion[]) =>
      addBankQuestions(context, session, questions),
    createTopic: async (session: ToolSession, topic: { sectionId: string; name: string }) =>
      createTopic(context, session, topic),
    writeReport: async (session: ToolSession, report: ReportInput) =>
      writeReport(context, session, report),
    /** Waits for the background work of started runs; the server calls it before it closes. */
    settle: async () => {
      await Promise.allSettled(context.pending);
    },
  };
}
export type Inbox = ReturnType<typeof createInbox>;
