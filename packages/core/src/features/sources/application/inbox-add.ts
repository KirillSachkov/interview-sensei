// `add_bank_questions` of Inbox processing: the agent writes Questions straight into the bank, each
// from a part of a material, or made up without one and so «не подтверждён». The server leaves out
// duplicates and counts them for the report.
import { randomUUID } from "node:crypto";

import type { ToolSession } from "../../../shared/mcp/index.ts";
import type { Transaction } from "../../../shared/storage/index.ts";
import type { InboxRun } from "../domain/inbox.ts";
import type { InboxBankQuestion, InboxNewQuestion, MaterialQuestion } from "../domain/ports.ts";
import type { Source } from "../domain/source.ts";
import { attachAnswer, matchingQuestion } from "./inbox-duplicates.ts";
import { refuseInRecheck, runOf } from "./inbox-context.ts";
import type { InboxContext } from "./inbox-context.ts";

/** A Question without a Source has no part and no reference answer. */
function checkMadeUp(question: MaterialQuestion): void {
  if (question.part !== undefined || (question.referenceAnswer ?? null) !== null) {
    throw new Error("A Question without a Source has neither a part nor a reference answer");
  }
}

/** Refuses a part the material lacks; a material without parts takes no part. */
function checkPartOf(source: Source, part: number | undefined): void {
  if (source.parts === null) {
    if (part !== undefined) {
      throw new Error(`The server could not read the Source ${source.id}: give no part`);
    }
  } else if (part === undefined) {
    throw new Error(`Give the part of the Source ${source.id}`);
  } else if (part > source.parts) {
    throw new Error(`The Source ${source.id} has no part ${part}`);
  }
}

/**
 * Refuses a part the run's material does not have. A web page the server could not read has no
 * parts: the agent read it on the web, so its Questions come without a part.
 */
function checkPart(
  { sourceId, part }: { sourceId: string; part: number | undefined },
  sources: readonly Source[],
  run: InboxRun,
): void {
  const source = sources.find((candidate) => candidate.id === sourceId);
  if (source === undefined || !run.sourceIds.includes(source.id)) {
    throw new Error(`The Source ${sourceId} is not a material of this processing`);
  }
  checkPartOf(source, part);
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
      checkMadeUp(question);
    } else {
      checkPart({ sourceId: question.sourceId, part: question.part }, sources, run);
    }
  }
}

function bankQuestion(question: MaterialQuestion, createdAt: string): InboxNewQuestion {
  const { referenceAnswer, sourceId, part } = question;
  const answer =
    referenceAnswer === undefined || referenceAnswer === null || sourceId === undefined
      ? null
      : { ...referenceAnswer, origin: "material" as const, sourceId, part: part ?? null };
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

/** Adds in order so repeats inside one call can enrich an earlier Question too. */
async function mergeQuestions(
  context: InboxContext,
  { targetId, questions }: { targetId: string; questions: readonly MaterialQuestion[] },
  transaction: Transaction,
) {
  const existing = [...(await context.dependencies.questions.questions(targetId, transaction))];
  const results = [];
  for (const question of questions) {
    // oxlint-disable-next-line eslint/no-await-in-loop -- writes share the transaction
    results.push(await mergeOne(context, { targetId, question, existing }, transaction));
  }
  return {
    rows: results.flatMap((result) => result.rows),
    duplicates: results.flatMap((result) => result.duplicates),
    answers: results.flatMap((result) => result.answers),
  };
}

async function mergeOne(
  context: InboxContext,
  {
    targetId,
    question,
    existing,
  }: { targetId: string; question: MaterialQuestion; existing: InboxBankQuestion[] },
  transaction: Transaction,
) {
  const match = matchingQuestion(context.dependencies.duplicates, question, existing);
  const row = bankQuestion(question, context.dependencies.clock.now().toISOString());
  if (match === undefined) {
    await context.dependencies.questions.addQuestions(targetId, [row], transaction);
    existing.push({ ...row, ratingComment: null });
    return { rows: [row], duplicates: [], answers: [] };
  }
  const result = await attachAnswer(
    context,
    { targetId, question, match, answer: row.referenceAnswer },
    transaction,
  );
  if (result?.status === "attached") {
    existing.splice(existing.indexOf(match), 1, { ...match, referenceAnswer: row.referenceAnswer });
  }
  return { rows: [], duplicates: [question.text], answers: result === null ? [] : [result] };
}

async function addIn(
  context: InboxContext,
  { session, questions }: { session: ToolSession; questions: readonly MaterialQuestion[] },
  transaction: Transaction,
) {
  const { inbox, repository } = context.dependencies;
  const { targetId, run } = await runOf(context, session, transaction);
  refuseInRecheck(run);
  checkSources(questions, await repository.list(targetId, transaction), run);
  const { rows, duplicates, answers } = await mergeQuestions(
    context,
    { targetId, questions },
    transaction,
  );
  const questionIds = rows.map((row) => row.id);
  await inbox.recordAdded(run.id, { questionIds, duplicates: duplicates.length }, transaction);
  return {
    added: rows.map(({ id, text }) => ({ id, text })),
    duplicates,
    answers,
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

export type { MaterialQuestion } from "../domain/ports.ts";
