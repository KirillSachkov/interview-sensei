// What the agent of an Inbox processing does through its MCP tools: reads the materials part by
// part, creates Topics inside Sections and writes the Inbox report; inbox-add.ts writes Questions. Each acts only on the running processing of its session's Target.
import { randomUUID } from "node:crypto";

import type { ToolSession } from "../../../shared/mcp/index.ts";
import type { Transaction } from "../../../shared/storage/index.ts";
import { inboxBrief } from "../domain/inbox-brief.ts";
import { agentSummary, settledSources } from "../domain/inbox.ts";
import type { DoubtfulQuestion, InboxReport, InboxRun, ReportProposals } from "../domain/inbox.ts";
import type { InboxTarget } from "../domain/ports.ts";
import type { Source } from "../domain/source.ts";
import { refuseInRecheck, runOf } from "./inbox-context.ts";
import type { InboxContext } from "./inbox-context.ts";
import { moveSettled } from "./inbox-ending.ts";

/** A material of the processing as the agent sees it. */
function listed(source: Source) {
  const { id, type, title, url, status, parts, failure } = source;
  return { id, type, title, url, status, parts, failure };
}

async function runSources({ dependencies }: InboxContext, run: InboxRun) {
  const all = await dependencies.repository.list(run.targetId);
  return all.filter((source) => run.sourceIds.includes(source.id));
}

/** The Target's visible Questions as the brief of a recheck lists them. */
async function visibleQuestions({ dependencies }: InboxContext, targetId: string) {
  const bank = await dependencies.questions.questions(targetId);
  return bank
    .filter((question) => !question.hidden)
    .map(({ id, topicId, text, level }) => ({ id, topicId, text, level }));
}

/**
 * The brief of the Inbox processing: the rules, the Target's plan and the materials; for a
 * recheck, the visible Questions instead.
 */
export async function brief(context: InboxContext, session: ToolSession): Promise<string> {
  const { targetId, run } = await runOf(context, session);
  const target = await context.dependencies.targets.get(targetId);
  if (target === undefined) {
    throw new Error("Target not found");
  }
  const sources = await runSources(context, run);
  const questions = run.mode === "recheck" ? await visibleQuestions(context, targetId) : [];
  return inboxBrief(target, {
    mode: run.mode,
    sources: sources.map((source) => listed(source)),
    questions,
  });
}

/** The materials of the running processing, with the number of parts of each. */
export async function listInbox(context: InboxContext, session: ToolSession) {
  const { run } = await runOf(context, session);
  const sources = await runSources(context, run);
  return sources.map((source) => listed(source));
}

/** The plan with the Topic added to the Section, as the targets slice stores it. */
function planWith(
  target: InboxTarget,
  { sectionId, topicId }: { sectionId: string; topicId: string },
) {
  const { name, level, tone, language, status } = target;
  return {
    name,
    level,
    tone,
    language,
    status,
    sections: target.sections.map(({ topics: _topics, ...section }) => ({
      ...section,
      topicIds: section.id === sectionId ? [...section.topicIds, topicId] : section.topicIds,
    })),
  };
}

/** The Target's plan and the Section of it; refuses a Section the plan does not have. */
async function planSection(
  { dependencies }: InboxContext,
  { targetId, sectionId }: { targetId: string; sectionId: string },
  transaction: Transaction,
) {
  const target = await dependencies.targets.get(targetId, transaction);
  const section = target?.sections.find((candidate) => candidate.id === sectionId);
  if (target === undefined || section === undefined) {
    throw new Error("Create a Topic only inside an existing Section of the Target's plan");
  }
  return { target, section };
}

async function createTopicIn(
  context: InboxContext,
  { session, sectionId, name }: { session: ToolSession; sectionId: string; name: string },
  transaction: Transaction,
) {
  const { targets, questions } = context.dependencies;
  const { targetId, run } = await runOf(context, session, transaction);
  refuseInRecheck(run);
  const { target, section } = await planSection(context, { targetId, sectionId }, transaction);
  const [topic] = await questions.ensureTopics(targetId, [name], transaction);
  if (topic === undefined) {
    throw new Error("The Topic was not created");
  }
  if (!section.topicIds.includes(topic.id)) {
    await targets.update(targetId, planWith(target, { sectionId, topicId: topic.id }), transaction);
  }
  return { id: topic.id, name: topic.name, sectionId };
}

/**
 * Creates the Topic inside an existing Section, or reuses the Target's Topic of that name and adds
 * it to the Section. The Sections themselves stay as they are.
 */
export async function createTopic(
  context: InboxContext,
  session: ToolSession,
  topic: { sectionId: string; name: string },
) {
  return context.dependencies.transaction(async (opened) =>
    createTopicIn(context, { session, ...topic }, opened),
  );
}

/** Ends the session after the agent's current turn; a failure goes to onError. */
async function endAfterTurn(
  { sessions, onError }: Pick<InboxContext["dependencies"], "sessions" | "onError">,
  sessionId: string,
): Promise<void> {
  try {
    await sessions.end(sessionId);
  } catch (error) {
    onError(error);
  }
}

/** The agent's part of the Inbox report. */
export interface ReportInput {
  readonly summary: string;
  readonly doubtful: readonly DoubtfulQuestion[];
  readonly proposals: ReportProposals;
}

/** Refuses a Question of the list «скрыть?» that is not the Target's. */
async function checkHide(
  { dependencies }: InboxContext,
  { targetId, input }: { targetId: string; input: ReportInput },
  transaction: Transaction,
): Promise<void> {
  const bank = await dependencies.questions.questions(targetId, transaction);
  const own = new Set(bank.map((question) => question.id));
  const foreign = input.proposals.hide.find(({ questionId }) => !own.has(questionId));
  if (foreign !== undefined) {
    throw new Error(`The Question ${foreign.questionId} is not a Question of this Target`);
  }
}

/** Stores the agent's report, moves the run's Sources and finishes the run, in the transaction. */
async function storeReport(
  context: InboxContext,
  { session, input }: { session: ToolSession; input: ReportInput },
  opened: Transaction,
) {
  const { repository, inbox, clock } = context.dependencies;
  const { targetId, run } = await runOf(context, session, opened);
  await checkHide(context, { targetId, input }, opened);
  const now = clock.now().toISOString();
  const { ready, back } = settledSources(run, await repository.list(targetId, opened));
  const report: InboxReport = {
    id: randomUUID(),
    targetId,
    runId: run.id,
    mode: run.mode,
    sourceIds: run.sourceIds,
    questionIds: run.questionIds,
    duplicates: run.duplicates,
    ...input,
    summary: agentSummary(input.summary, back.length),
    partial: false,
    createdAt: now,
  };
  await inbox.addReport(report, opened);
  await moveSettled(context, { targetId, ready, back }, opened);
  await inbox.finishRun(run.id, now, opened);
  return { report, run };
}

/**
 * Stores the Inbox report with what the server counted and finishes the run. A material becomes
 * «готов» only when the agent read every part of it; the others go back to the Inbox, and the
 * summary says how many. The agent stops after its current turn.
 */
export async function writeReport(
  context: InboxContext,
  session: ToolSession,
  input: ReportInput,
): Promise<InboxReport> {
  const { sessions, onError } = context.dependencies;
  const { report, run } = await context.dependencies.transaction(async (opened) =>
    storeReport(context, { session, input }, opened),
  );
  // The session ends after this turn: the tool call is part of it, so nothing waits for the end.
  void endAfterTurn({ sessions, onError }, run.sessionId ?? session.sessionId);
  return report;
}
