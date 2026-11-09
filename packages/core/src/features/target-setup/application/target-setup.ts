import { randomUUID } from "node:crypto";

import type { RunInTransaction, Transaction } from "../../../shared/storage/index.ts";
import type { Clock } from "../../../shared/time/index.ts";
import { onboardingPrompt, setupBrief } from "../domain/brief.ts";
import { draftProblems, stateAfter } from "../domain/draft.ts";
import type { DraftChange, DraftOperation } from "../domain/draft.ts";
import { withoutDuplicates } from "../domain/draft-questions.ts";
import type { NewQuestion } from "../domain/draft-questions.ts";
import type {
  DraftRepository,
  SetupQuestions,
  SetupTarget,
  SetupTargets,
  SetupTopics,
} from "../domain/ports.ts";
import { currentState } from "./setup-state.ts";
import { writeDraft } from "./write-draft.ts";

export interface TargetSetupDependencies {
  readonly drafts: DraftRepository<Transaction>;
  readonly targets: SetupTargets<Transaction>;
  readonly topics: SetupTopics<Transaction> & SetupQuestions<Transaction>;
  /** Applying the draft writes targets, question-bank and the draft in this one transaction. */
  readonly transaction: RunInTransaction;
  readonly clock: Clock;
}

/**
 * - `applied`: the Target has its new state, and the draft is empty.
 * - `not_found`: no Target has this id.
 * - `empty`: the draft has no changes.
 * - `invalid`: the draft cannot be applied for the `problems`; nothing changed.
 */
export type ApplyOutcome =
  | { readonly outcome: "applied"; readonly target: SetupTarget; readonly changes: number }
  | { readonly outcome: "not_found" }
  | { readonly outcome: "empty" }
  | { readonly outcome: "invalid"; readonly problems: readonly string[] };

/**
 * - `recorded`: the draft has the change and `size` changes in all.
 * - `not_found`: no Target has this id.
 * - `refused`: the change names things the Target and its draft do not have; nothing recorded.
 */
export type RecordOutcome =
  | { readonly outcome: "recorded"; readonly change: DraftChange; readonly size: number }
  | { readonly outcome: "not_found" }
  | { readonly outcome: "refused"; readonly problems: readonly string[] };

/** The Target's state before and after its draft; null for an unknown Target. */
async function withDraft(
  dependencies: TargetSetupDependencies,
  targetId: string,
  transaction?: Transaction,
) {
  const current = await currentState(dependencies, targetId, transaction);
  if (current === null) {
    return null;
  }
  const changes = await dependencies.drafts.changes(targetId, transaction);
  const operations = changes.map((change) => change.operation);
  return { ...current, changes, operations, after: stateAfter(current.state, operations) };
}

type Draft = NonNullable<Awaited<ReturnType<typeof withDraft>>>;

/** Why the draft cannot be applied; null when it can. */
function refusal(draft: Draft | null): ApplyOutcome | null {
  if (draft === null) {
    return { outcome: "not_found" };
  }
  if (draft.changes.length === 0) {
    return { outcome: "empty" };
  }
  const problems = draftProblems(draft.after);
  return problems.length > 0 ? { outcome: "invalid", problems } : null;
}

async function applyIn(
  dependencies: TargetSetupDependencies,
  targetId: string,
  transaction: Transaction,
): Promise<ApplyOutcome> {
  const draft = await withDraft(dependencies, targetId, transaction);
  const refused = refusal(draft);
  if (refused !== null || draft === null) {
    return refused ?? { outcome: "not_found" };
  }
  const target = await writeDraft(dependencies, {
    targetId,
    before: draft.questions,
    state: draft.after,
    transaction,
  });
  if (target === undefined) {
    throw new Error("The Target disappeared while its draft was applied");
  }
  await dependencies.drafts.clear(targetId, transaction);
  return { outcome: "applied", target, changes: draft.changes.length };
}

/**
 * Records the change in the Target's draft, unless it changes something that neither the Target
 * nor its draft has.
 */
async function record(
  dependencies: TargetSetupDependencies,
  targetId: string,
  operation: DraftOperation,
): Promise<RecordOutcome> {
  const draft = await withDraft(dependencies, targetId);
  if (draft === null) {
    return { outcome: "not_found" };
  }
  const next = stateAfter(draft.state, [...draft.operations, operation]);
  const problems = next.missing.slice(draft.after.missing.length);
  if (problems.length > 0) {
    return { outcome: "refused", problems };
  }
  const change: DraftChange = {
    id: randomUUID(),
    targetId,
    operation,
    createdAt: dependencies.clock.now().toISOString(),
  };
  await dependencies.drafts.add(change);
  return { outcome: "recorded", change, size: draft.changes.length + 1 };
}

/** The new Question with its id, by which the agent can edit it before the draft is applied. */
function withId(question: Omit<NewQuestion, "id">): NewQuestion {
  return { ...question, id: randomUUID() };
}

/**
 * Records the Questions that neither the Target nor its draft has yet, by questionKey, and
 * returns the duplicates it left out; null for an unknown Target.
 */
async function addQuestions(
  dependencies: TargetSetupDependencies,
  targetId: string,
  questions: readonly Omit<NewQuestion, "id">[],
) {
  const draft = await withDraft(dependencies, targetId);
  if (draft === null) {
    return null;
  }
  const texts = draft.after.questions.map((question) => question.text);
  const { kept, duplicates } = withoutDuplicates(questions, texts);
  const added = kept.map((question) => withId(question));
  const recorded =
    added.length === 0
      ? null
      : await record(dependencies, targetId, { type: "add_questions", questions: added });
  return { recorded, added, duplicates };
}

/** The draft of changes of each Target and its application to the Target. */
export function createTargetSetup(dependencies: TargetSetupDependencies) {
  const { drafts, targets, transaction } = dependencies;
  return {
    /** The Target's draft in the order of recording; undefined for an unknown Target. */
    draft: async (targetId: string) =>
      (await targets.get(targetId)) === undefined ? undefined : drafts.changes(targetId),
    record: async (targetId: string, operation: DraftOperation) =>
      record(dependencies, targetId, operation),
    addQuestions: async (targetId: string, questions: readonly Omit<NewQuestion, "id">[]) =>
      addQuestions(dependencies, targetId, questions),
    /** Removes one change; false when the Target's draft has no such change. */
    removeChange: async (targetId: string, changeId: string) => drafts.remove(targetId, changeId),
    /** Empties the Target's draft; resolves with the number of removed changes. */
    discard: async (targetId: string) => drafts.clear(targetId),
    /** Writes the whole draft to the Target in one transaction, or nothing. */
    apply: async (targetId: string): Promise<ApplyOutcome> =>
      transaction(async (opened) => applyIn(dependencies, targetId, opened)),
    /** Erases the Target's draft when the Target is deleted for good. */
    eraseTarget: async (targetId: string, opened: Transaction) => drafts.clear(targetId, opened),
    /** The brief of the Target's setup session; undefined for an unknown Target. */
    brief: async (targetId: string) => {
      const target = await targets.get(targetId);
      return target === undefined ? undefined : setupBrief(target, await drafts.changes(targetId));
    },
    /**
     * The application's first prompt of a new setup session: the onboarding prompt for a draft
     * Target; undefined otherwise, and for an unknown Target.
     */
    opening: async (targetId: string) => {
      const target = await targets.get(targetId);
      return target?.status === "draft" ? onboardingPrompt : undefined;
    },
  };
}
export type TargetSetup = ReturnType<typeof createTargetSetup>;
