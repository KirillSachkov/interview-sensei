// The agent's work in an answer search, through its MCP tools: the next Questions of the run's
// queue, a reference answer for each, and the report. Each acts only on the session's Target.
import { randomUUID } from "node:crypto";

import { endAfterTurn } from "../../../shared/background-work/index.ts";
import type { ToolSession } from "../../../shared/mcp/index.ts";
import type { Transaction } from "../../../shared/storage/index.ts";
import { answerReport, withSaved } from "../domain/answer-run.ts";
import type { AnswerReport, AnswerRun, FailedQuestion } from "../domain/answer-run.ts";
import { overwriteRefusal } from "../domain/answer-search.ts";
import type { SearchOrigin } from "../domain/answer-search.ts";
import type { AnswerBankQuestion } from "../domain/ports.ts";
import { runOf } from "./answer-context.ts";
import type { AnswerContext } from "./answer-context.ts";

/** A Question of the queue as the agent gets it. */
interface NextQuestion {
  readonly id: string;
  readonly text: string;
  readonly topic: string;
  readonly level: string;
  readonly sectionKind: string | null;
  /** `agent` when the Question has an answer «из знаний агента» to back with a source. */
  readonly currentOrigin: "agent" | null;
}

/** The Section kind of the Question, or of the first Section that checks its Topic. */
async function sectionKinds(context: AnswerContext, targetId: string) {
  const target = await context.dependencies.targets.get(targetId);
  return (question: AnswerBankQuestion) =>
    question.sectionKind ??
    target?.sections.find((section) => section.topicIds.includes(question.topicId))?.kind ??
    null;
}

/**
 * Takes the next visible Questions of the run's queue that the agent has not taken yet, at most
 * `count`, and records them as handed, in the open transaction: parallel calls get different
 * Questions. A Question hidden since the start is skipped and never counts as handed.
 */
async function takeNext(
  context: AnswerContext,
  { session, count }: { session: ToolSession; count: number },
  opened: Transaction,
) {
  const { questions, repository } = context.dependencies;
  const { targetId, run } = await runOf(context, session, opened);
  const bank = await questions.questions(targetId, opened);
  const visible = new Map(
    bank.filter((question) => !question.hidden).map((question) => [question.id, question]),
  );
  const handed = new Set(run.handedIds);
  const open = run.queueIds.flatMap((id) => {
    const question = visible.get(id);
    return question === undefined || handed.has(id) ? [] : [question];
  });
  const next = open.slice(0, count);
  await repository.setHanded(run.id, [...run.handedIds, ...next.map(({ id }) => id)], opened);
  return { targetId, next, left: open.length - next.length, total: run.queueIds.length };
}

/**
 * `next_questions_without_answer`: the next Questions of the run's queue that the agent has not
 * taken yet, at most `count`; an empty list when the queue is done.
 */
export async function nextQuestions(
  context: AnswerContext,
  session: ToolSession,
  count: number,
): Promise<{ questions: NextQuestion[]; left: number; total: number }> {
  const { targetId, next, left, total } = await context.dependencies.transaction(async (opened) =>
    takeNext(context, { session, count }, opened),
  );
  const [topics, kindOf] = await Promise.all([
    context.dependencies.questions.topics(targetId),
    sectionKinds(context, targetId),
  ]);
  const topicNames = new Map(topics.map((topic) => [topic.id, topic.name]));
  return {
    questions: next.map((question) => ({
      id: question.id,
      text: question.text,
      topic: topicNames.get(question.topicId) ?? "",
      level: question.level,
      sectionKind: kindOf(question),
      currentOrigin: question.referenceAnswer?.origin === "agent" ? "agent" : null,
    })),
    left,
    total,
  };
}

/** The agent's reference answer for one Question. */
export interface AnswerInput {
  readonly questionId: string;
  readonly points: readonly string[];
  readonly sample: string;
  readonly origin: SearchOrigin;
  readonly links: readonly string[];
}

/** Rejects links that do not match the origin: a source for «из интернета», none otherwise. */
function checkLinks({ origin, links }: AnswerInput): void {
  if (origin === "internet" && links.length === 0) {
    throw new Error("An answer from the internet needs the links to its sources");
  }
  if (origin === "agent" && links.length > 0) {
    throw new Error("An answer with sources is from the internet: give the origin internet");
  }
}

/**
 * Checks in the transaction that next_questions_without_answer gave the Question to this run, that
 * it is still visible and that its current answer gives way to one of the origin; rejects
 * otherwise. So the run writes at most the answers of its queue, never more than the Candidate
 * chose.
 */
async function checkWritable(
  context: AnswerContext,
  { run, input }: { run: AnswerRun; input: AnswerInput },
  opened: Transaction,
): Promise<void> {
  if (!run.handedIds.includes(input.questionId)) {
    throw new Error(
      `The Question ${input.questionId} is not one next_questions_without_answer gave this answer search`,
    );
  }
  const bank = await context.dependencies.questions.questions(run.targetId, opened);
  const question = bank.find((candidate) => candidate.id === input.questionId);
  if (question === undefined || question.hidden) {
    throw new Error(`The Question ${input.questionId} is hidden; it needs no reference answer`);
  }
  const refusal = overwriteRefusal(question.referenceAnswer, input.origin);
  if (refusal !== null) {
    throw new Error(refusal);
  }
}

/** Writes the answer and records it in the run, in the open transaction. */
async function storeAnswer(
  context: AnswerContext,
  { session, input }: { session: ToolSession; input: AnswerInput },
  opened: Transaction,
): Promise<{ filled: number; total: number }> {
  const { questions, repository } = context.dependencies;
  const { targetId, run } = await runOf(context, session, opened);
  await checkWritable(context, { run, input }, opened);
  const { questionId, points, sample, origin, links } = input;
  const referenceAnswer = { points, sample, origin, sourceId: null, part: null, links };
  await questions.editQuestions(targetId, [{ id: questionId, referenceAnswer }], opened);
  const saved = withSaved(run, { questionId, origin });
  await repository.setSaved(run.id, saved, opened);
  return { filled: saved.length, total: run.queueIds.length };
}

/**
 * `save_reference_answer`: writes the answer to a Question of the session's Target, unless its
 * current answer stays by overwriteRefusal; the run records it in the same transaction.
 */
export async function saveAnswer(
  context: AnswerContext,
  session: ToolSession,
  input: AnswerInput,
): Promise<{ filled: number; total: number }> {
  checkLinks(input);
  return context.dependencies.transaction(async (opened) =>
    storeAnswer(context, { session, input }, opened),
  );
}

/** The agent's part of the answer report. */
export interface ReportInput {
  readonly summary: string;
  readonly failed: readonly FailedQuestion[];
}

/**
 * `write_answer_report`: stores the report with what the server counted and finishes the run. The
 * agent stops after its current turn.
 */
export async function writeReport(
  context: AnswerContext,
  session: ToolSession,
  input: ReportInput,
): Promise<AnswerReport> {
  const { repository, clock, sessions, onError, transaction } = context.dependencies;
  const { report, run } = await transaction(async (opened) => {
    const { run: current } = await runOf(context, session, opened);
    const foreign = input.failed.find(({ questionId }) => !current.queueIds.includes(questionId));
    if (foreign !== undefined) {
      throw new Error(`The Question ${foreign.questionId} is not in this answer search's queue`);
    }
    const createdAt = clock.now().toISOString();
    const written = answerReport(current, input, { id: randomUUID(), createdAt });
    await repository.addReport(written, opened);
    await repository.finishRun(current.id, createdAt, opened);
    return { report: written, run: current };
  });
  // The session ends after this turn: the tool call is part of it, so nothing waits for the end.
  endAfterTurn({ sessions, onError }, run.sessionId ?? session.sessionId);
  return report;
}
