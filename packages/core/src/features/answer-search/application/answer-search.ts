// Answer search of each Target (spec #70): the start by «Найти ответы», the agent's work through its
// MCP tools, «Остановить» and the report.
import type { ToolSession } from "../../../shared/mcp/index.ts";
import type { Transaction } from "../../../shared/storage/index.ts";
import type { AnswerContext, AnswerDependencies } from "./answer-context.ts";
import { endInterrupted, stop } from "./answer-ending.ts";
import { inboxFinished, start } from "./answer-start.ts";
import { answerState, reportView } from "./answer-views.ts";
import { nextQuestions, saveAnswer, writeReport } from "./answer-work.ts";
import type { AnswerInput, ReportInput } from "./answer-work.ts";

export function createAnswerSearch(dependencies: AnswerDependencies) {
  const context: AnswerContext = { dependencies, pending: new Set() };
  return {
    /**
     * «Найти ответы»: up to `count` Questions of the queue. Waits while the Target's Inbox processing
     * runs; call inboxFinished when it ends.
     */
    start: async (request: { targetId: string; count: number }) => start(context, request),
    /** The Target's Inbox processing or Recheck ended: a waiting answer search begins. */
    inboxFinished: (targetId: string) => {
      inboxFinished(context, targetId);
    },
    /** «Остановить»: a partial report; the written answers stay. */
    stop: async (targetId: string) => stop(context, targetId),
    /** Closes the runs of the last start of the server with partial reports; call it at start. */
    endInterrupted: async () => endInterrupted(context),
    state: async (targetId: string) => answerState(context, targetId),
    report: async (targetId: string, reportId: string) =>
      reportView(context, { targetId, reportId }),
    nextQuestions: async (session: ToolSession, count: number) =>
      nextQuestions(context, session, count),
    saveAnswer: async (session: ToolSession, input: AnswerInput) =>
      saveAnswer(context, session, input),
    writeReport: async (session: ToolSession, input: ReportInput) =>
      writeReport(context, session, input),
    /** Erases the Target's runs and reports when the Target is deleted for good. */
    eraseTarget: async (targetId: string, transaction: Transaction) =>
      dependencies.repository.erase(targetId, transaction),
    /** Waits for the background work of started runs; the server calls it before it closes. */
    settle: async () => {
      await Promise.allSettled(context.pending);
    },
  };
}
export type AnswerSearch = ReturnType<typeof createAnswerSearch>;
