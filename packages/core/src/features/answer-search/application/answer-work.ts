// The agent's work in an answer search, through its MCP tools: the next Questions of the run's
// queue, a reference answer for each, and the report. Each acts only on the session's Target.
import { randomUUID } from "node:crypto";

import type { ToolSession } from "../../../shared/mcp/index.ts";
import type { Transaction } from "../../../shared/storage/index.ts";
import { answerReport, withSaved } from "../domain/answer-run.ts";
import type { AnswerReport, FailedQuestion } from "../domain/answer-run.ts";
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
 * `next_questions_without_answer`: the next Questions of the run's queue that the agent has not
 * taken yet, at most `count`; an empty list when the queue is done.
 */
export async function nextQuestions(
  context: AnswerContext,
  session: ToolSession,
  count: number,
): Promise<{ questions: NextQuestion[]; left: number; total: number }> {
  const { questions, repository } = context.dependencies;
  const { targetId, run } = await runOf(context, session);
  const handed = new Set(run.handedIds);
  const next = run.queueIds.filter((id) => !handed.has(id)).slice(0, count);
  const [bank, topics, kindOf] = await Promise.all([
    questions.questions(targetId),
    questions.topics(targetId),
    sectionKinds(context, targetId),
  ]);
  const byId = new Map(bank.map((question) => [question.id, question]));
  const topicNames = new Map(topics.map((topic) => [topic.id, topic.name]));
  const shown = next.flatMap((id) => {
    const question = byId.get(id);
    return question === undefined || question.hidden ? [] : [question];
  });
  await repository.setHanded(run.id, [...run.handedIds, ...next]);
  return {
    questions: shown.map((question) => ({
      id: question.id,
      text: question.text,
      topic: topicNames.get(question.topicId) ?? "",
      level: question.level,
      sectionKind: kindOf(question),
      currentOrigin: question.referenceAnswer?.origin === "agent" ? "agent" : null,
    })),
    left: run.queueIds.length - handed.size - next.length,
    total: run.queueIds.length,
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
 * Checks in the transaction that the Question is the Target's and that its current answer gives
 * way to one of the origin; rejects otherwise.
 */
async function checkWritable(
  context: AnswerContext,
  { targetId, input }: { targetId: string; input: AnswerInput },
  opened: Transaction,
): Promise<void> {
  const bank = await context.dependencies.questions.questions(targetId, opened);
  const question = bank.find((candidate) => candidate.id === input.questionId);
  if (question === undefined) {
    throw new Error(`The Question ${input.questionId} is not a Question of this Target`);
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
  await checkWritable(context, { targetId, input }, opened);
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
  void (async () => {
    try {
      await sessions.end(run.sessionId ?? session.sessionId);
    } catch (error) {
      onError(error);
    }
  })();
  return report;
}
