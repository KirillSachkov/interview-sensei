// Writes the Target's state after its draft through the targets and question-bank slices, in the
// transaction of the application.
import { randomUUID } from "node:crypto";

import type { Transaction } from "../../../shared/storage/index.ts";
import type { Clock } from "../../../shared/time/index.ts";
import type { SetupState } from "../domain/draft.ts";
import type { DraftQuestion } from "../domain/draft-questions.ts";
import type {
  SetupAttempts,
  SetupQuestion,
  SetupQuestionEdit,
  TargetUpdate,
} from "../domain/ports.ts";
import { confirms } from "../domain/question-confirmation.ts";
import type { StateSources } from "./setup-state.ts";

/** What writing the draft uses: the slices that keep the Target's data, and the clock. */
type Writers = StateSources & { clock: Clock; attempts: SetupAttempts<Transaction> };

interface Write {
  readonly targetId: string;
  readonly state: SetupState;
  readonly transaction: Transaction;
}

/** The Target's new state with the Topic ids of the names, which come in the order of the plan. */
function updateOf(state: SetupState, topicIds: readonly string[]): TargetUpdate {
  let next = 0;
  return {
    name: state.name,
    level: state.level,
    tone: state.tone,
    language: state.language,
    status: state.status,
    sections: state.sections.map(({ id, topics, ...section }, position) => ({
      ...section,
      id: id ?? randomUUID(),
      position,
      // A Section lists a Topic once, even when the draft named it twice.
      topicIds: [...new Set(topics.map(() => topicIds[next++] ?? ""))],
    })),
  };
}

/**
 * The fields of the Question that the draft changed; null when it changed none. An edit that
 * confirms a made-up Question also takes off its mark «не подтверждён».
 */
function editOf(before: SetupQuestion, after: DraftQuestion, topicId: string) {
  const fields = {
    ...(after.text === before.text ? {} : { text: after.text }),
    ...(topicId === before.topicId ? {} : { topicId }),
    ...(after.hidden === before.hidden ? {} : { hidden: after.hidden }),
    ...(after.rating === before.rating ? {} : { rating: after.rating }),
  };
  const confirmed = before.unconfirmed && confirms(fields) ? { unconfirmed: false as const } : {};
  const edit: SetupQuestionEdit = { id: before.id, ...fields, ...confirmed };
  return Object.keys(edit).length > 1 ? edit : null;
}

/** The draft's new Question with its Topic id; it takes the Target's level unless it has one. */
function addedOf(
  { topic: _topic, ...question }: DraftQuestion,
  { topicId, state, createdAt }: { topicId: string; state: SetupState; createdAt: string },
) {
  const level = question.level ?? state.level;
  if (level === null) {
    throw new Error("A new Question needs a level; draftProblems reports it");
  }
  return { ...question, topicId, level, createdAt };
}

/** Adds the draft's new Questions and stores the edits of the Target's Questions. */
async function writeQuestions(
  { topics, clock }: StateSources & { clock: Clock },
  {
    targetId,
    before,
    state,
    transaction,
    topicIds,
  }: Write & { before: readonly SetupQuestion[]; topicIds: readonly string[] },
) {
  const stored = new Map(before.map((question) => [question.id, question]));
  const createdAt = clock.now().toISOString();
  const added = state.questions.flatMap((question, index) =>
    stored.has(question.id)
      ? []
      : [addedOf(question, { topicId: topicIds[index] ?? "", state, createdAt })],
  );
  const edits = state.questions.flatMap((question, index) => {
    const old = stored.get(question.id);
    const edit = old === undefined ? null : editOf(old, question, topicIds[index] ?? "");
    return edit === null ? [] : [edit];
  });
  await topics.addQuestions(targetId, added, transaction);
  await topics.editQuestions(targetId, edits, transaction);
}

/**
 * Renames and merges Topics in order: a later rename may use an earlier one's name. A merged
 * Topic's Attempts go to the Topic it merged into.
 */
async function renameTopics(
  { topics, attempts }: Writers,
  { targetId, state, transaction }: Write,
) {
  for (const rename of state.topicRenames) {
    /* oxlint-disable eslint/no-await-in-loop -- the renames run in order in one transaction */
    const merge = await topics.renameTopic(targetId, rename, transaction);
    if (merge !== null) {
      await attempts.mergeTopic(targetId, merge, transaction);
    }
    /* oxlint-enable eslint/no-await-in-loop */
  }
}

/** The ids of the Topics the plan names, then of the Topics of the Questions; creates missing ones. */
async function topicIdsOf({ topics }: StateSources, { targetId, state, transaction }: Write) {
  const planNames = state.sections.flatMap((section) => section.topics);
  const questionNames = state.questions.map((question) => question.topic);
  const named = await topics.ensureTopics(targetId, [...planNames, ...questionNames], transaction);
  const ids = named.map((topic) => topic.id);
  return { plan: ids.slice(0, planNames.length), questions: ids.slice(planNames.length) };
}

/**
 * Renames and merges Topics, creates the missing ones, writes the Questions, the Preferences and
 * the Target's new state; resolves with the Target.
 */
export async function writeDraft(dependencies: Writers, write: Write) {
  const { targets } = dependencies;
  const { targetId, state, transaction } = write;
  await renameTopics(dependencies, write);
  // A merge moves Questions to another Topic without the Candidate's edit, so the edits compare
  // the draft with the Questions after the merges.
  const before = await dependencies.topics.questions(targetId, transaction);
  const topicIds = await topicIdsOf(dependencies, write);
  await writeQuestions(dependencies, { ...write, before, topicIds: topicIds.questions });
  await targets.savePreferences(targetId, state.preferences, transaction);
  return targets.update(targetId, updateOf(state, topicIds.plan), transaction);
}
