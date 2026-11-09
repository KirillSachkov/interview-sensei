// What the agent of an Inbox processing does through its MCP tools: reads the materials part by
// part, writes Questions straight into the bank, creates Topics inside Sections and writes the
// Inbox report. Each acts only on the running processing of its session's Target.
import { randomUUID } from "node:crypto";

import type { ToolSession } from "../../../shared/mcp/index.ts";
import type { Transaction } from "../../../shared/storage/index.ts";
import { inboxBrief } from "../domain/inbox.ts";
import type { DoubtfulQuestion, InboxReport, InboxRun, ReportProposals } from "../domain/inbox.ts";
import type { InboxNewQuestion, InboxTarget } from "../domain/ports.ts";
import type { Source } from "../domain/source.ts";
import { runOf, sessionTarget } from "./inbox-context.ts";
import type { InboxContext } from "./inbox-context.ts";

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

/** A recheck changes nothing: it only proposes Questions to hide. */
function refuseInRecheck(run: InboxRun): void {
  if (run.mode === "recheck") {
    throw new Error("A recheck changes nothing: list the Questions to hide in write_inbox_report");
  }
}

/** The materials of the running processing, with the number of parts of each. */
export async function listInbox(context: InboxContext, session: ToolSession) {
  const { run } = await runOf(context, session);
  const sources = await runSources(context, run);
  return sources.map((source) => listed(source));
}

/** One part of a material's text; the agent reads every part from 1 to `parts`. */
export async function readSource(
  { dependencies }: InboxContext,
  session: ToolSession,
  { id, part }: { id: string; part: number },
) {
  const targetId = sessionTarget(session);
  const source = await dependencies.repository.get(targetId, id);
  if (source === undefined) {
    throw new Error("Source not found");
  }
  if (source.parts === null) {
    throw new Error("The server has not read this material's text");
  }
  const text = part <= source.parts ? await dependencies.texts.read(targetId, id, part) : undefined;
  if (text === undefined) {
    throw new Error(`The material has parts 1 to ${source.parts}`);
  }
  return { sourceId: id, part, parts: source.parts, text };
}

/** A Question of `add_bank_questions` as the agent gives it. */
export interface MaterialQuestion {
  readonly topicId: string;
  readonly text: string;
  readonly format: "open" | "quiz";
  readonly options: readonly { readonly id: string; readonly text: string }[];
  readonly correctOptionIds: readonly string[];
  readonly level: "junior" | "middle" | "senior";
  readonly sectionKind: "conversation" | "topics" | "design";
  /** The material; without it the agent made the Question up, and it is unconfirmed. */
  readonly sourceId?: string | undefined;
  readonly part?: number | undefined;
  readonly referenceAnswer?:
    { readonly points: readonly string[]; readonly sample: string } | null | undefined;
}

/**
 * Refuses a Question whose Source is not a material of the run or whose part it lacks. A Question
 * without a Source has no part and no reference answer: the answer comes only from the material.
 */
function checkSources(
  questions: readonly MaterialQuestion[],
  sources: readonly Source[],
  run: InboxRun,
): void {
  for (const question of questions) {
    if (question.sourceId === undefined) {
      if (question.part !== undefined || (question.referenceAnswer ?? null) !== null) {
        throw new Error("A Question without a Source has neither a part nor a reference answer");
      }
      continue;
    }
    if (question.part === undefined) {
      throw new Error(`Give the part of the Source ${question.sourceId}`);
    }
    const source = sources.find((candidate) => candidate.id === question.sourceId);
    if (source === undefined || !run.sourceIds.includes(source.id)) {
      throw new Error(`The Source ${question.sourceId} is not a material of this processing`);
    }
    if (source.parts === null || question.part > source.parts) {
      throw new Error(`The Source ${question.sourceId} has no part ${question.part}`);
    }
  }
}

function bankQuestion(question: MaterialQuestion, createdAt: string): InboxNewQuestion {
  const { referenceAnswer, sourceId, part } = question;
  const answer =
    referenceAnswer === undefined ||
    referenceAnswer === null ||
    sourceId === undefined ||
    part === undefined
      ? null
      : { ...referenceAnswer, origin: "material" as const, sourceId, part };
  return {
    id: randomUUID(),
    topicId: question.topicId,
    text: question.text,
    format: question.format,
    options: question.options,
    correctOptionIds: question.correctOptionIds,
    level: question.level,
    hidden: false,
    rating: null,
    createdAt,
    sourceIds: sourceId === undefined ? [] : [sourceId],
    sourcePart: part ?? null,
    sectionKind: question.sectionKind,
    referenceAnswer: answer,
    unconfirmed: sourceId === undefined,
    unseen: true,
  };
}

/** The new Questions without the duplicates of the Target's Questions and of each other. */
async function filtered(
  { dependencies }: InboxContext,
  { targetId, questions }: { targetId: string; questions: readonly MaterialQuestion[] },
  transaction: Transaction,
) {
  const existing = await dependencies.questions.questions(targetId, transaction);
  const texts = existing.map((question) => question.text);
  const { kept, duplicates } = dependencies.duplicates.withoutDuplicates(questions, texts);
  const createdAt = dependencies.clock.now().toISOString();
  return { rows: kept.map((question) => bankQuestion(question, createdAt)), duplicates };
}

async function addIn(
  context: InboxContext,
  { session, questions }: { session: ToolSession; questions: readonly MaterialQuestion[] },
  transaction: Transaction,
) {
  const { questions: bank, inbox, repository } = context.dependencies;
  const { targetId, run } = await runOf(context, session, transaction);
  refuseInRecheck(run);
  checkSources(questions, await repository.list(targetId, transaction), run);
  const { rows, duplicates } = await filtered(context, { targetId, questions }, transaction);
  if (rows.length > 0) {
    await bank.addQuestions(targetId, rows, transaction);
  }
  const questionIds = rows.map((row) => row.id);
  await inbox.recordAdded(run.id, { questionIds, duplicates: duplicates.length }, transaction);
  return {
    added: rows.map(({ id, text }) => ({ id, text })),
    duplicates: duplicates.map((question) => question.text),
  };
}

/**
 * Writes the Questions straight into the bank, without the draft of changes. The server leaves out
 * duplicates of the Target's Questions by the rule of the Target setup and counts them for the
 * report.
 */
export async function addBankQuestions(
  context: InboxContext,
  session: ToolSession,
  questions: readonly MaterialQuestion[],
) {
  return context.dependencies.transaction(async (opened) =>
    addIn(context, { session, questions }, opened),
  );
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

/**
 * Stores the Inbox report with what the server counted, marks the processed Sources «готов» and
 * finishes the run. The agent stops after its current turn.
 */
export async function writeReport(
  context: InboxContext,
  session: ToolSession,
  input: ReportInput,
): Promise<InboxReport> {
  const { dependencies } = context;
  const { repository, inbox, clock, sessions, onError } = dependencies;
  const { report, run } = await dependencies.transaction(async (opened) => {
    const found = await runOf(context, session, opened);
    await checkHide(context, { targetId: found.targetId, input }, opened);
    const now = clock.now().toISOString();
    const written: InboxReport = {
      id: randomUUID(),
      targetId: found.targetId,
      runId: found.run.id,
      mode: found.run.mode,
      sourceIds: found.run.sourceIds,
      questionIds: found.run.questionIds,
      duplicates: found.run.duplicates,
      ...input,
      partial: false,
      createdAt: now,
    };
    await inbox.addReport(written, opened);
    await repository.setStatus(
      found.targetId,
      { ids: found.run.sourceIds, status: "ready", from: "processing" },
      opened,
    );
    await inbox.finishRun(found.run.id, now, opened);
    return { report: written, run: found.run };
  });
  // The session ends after this turn: the tool call is part of it, so nothing waits for the end.
  void endAfterTurn({ sessions, onError }, run.sessionId ?? session.sessionId);
  return report;
}
