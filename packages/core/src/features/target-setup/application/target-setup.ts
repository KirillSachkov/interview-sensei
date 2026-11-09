import { randomUUID } from "node:crypto";

import type { RunInTransaction, Transaction } from "../../../shared/storage/index.ts";
import type { Clock } from "../../../shared/time/index.ts";
import { onboardingPrompt, setupBrief } from "../domain/brief.ts";
import { draftProblems, stateAfter } from "../domain/draft.ts";
import type { DraftChange, DraftOperation, SetupState } from "../domain/draft.ts";
import type {
  DraftRepository,
  SetupTarget,
  SetupTargets,
  SetupTopics,
  TargetUpdate,
} from "../domain/ports.ts";

export interface TargetSetupDependencies {
  readonly drafts: DraftRepository<Transaction>;
  readonly targets: SetupTargets<Transaction>;
  readonly topics: SetupTopics<Transaction>;
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

function stateOf(target: SetupTarget): SetupState {
  return {
    name: target.name,
    level: target.level,
    tone: target.tone,
    language: target.language,
    status: target.status,
    sections: target.sections.map(({ topics, ...section }) => ({
      ...section,
      topics: topics.map((topic) => topic.name),
    })),
  };
}

/** The Target's new state with the Topic ids of the names, which come in the order of the plan. */
function updateOf(state: SetupState, topicIds: readonly string[]): TargetUpdate {
  let next = 0;
  return {
    ...state,
    sections: state.sections.map(({ id, topics, ...section }, position) => ({
      ...section,
      id: id ?? randomUUID(),
      position,
      // A Section lists a Topic once, even when the draft named it twice.
      topicIds: [...new Set(topics.map(() => topicIds[next++] ?? ""))],
    })),
  };
}

/** The Target's state after its draft, or why nothing can be applied. */
async function pending(
  { drafts, targets }: TargetSetupDependencies,
  targetId: string,
  transaction: Transaction,
) {
  const target = await targets.get(targetId, transaction);
  if (target === undefined) {
    return { outcome: "not_found" } as const;
  }
  const changes = await drafts.changes(targetId, transaction);
  if (changes.length === 0) {
    return { outcome: "empty" } as const;
  }
  const state = stateAfter(
    stateOf(target),
    changes.map((change) => change.operation),
  );
  const problems = draftProblems(state);
  return problems.length > 0
    ? ({ outcome: "invalid", problems } as const)
    : ({ outcome: "ready", state, changes: changes.length } as const);
}

/** Creates the missing Topics, then writes the Target's new state. */
async function write(
  { topics, targets }: TargetSetupDependencies,
  {
    targetId,
    state,
    transaction,
  }: { targetId: string; state: SetupState; transaction: Transaction },
) {
  const names = state.sections.flatMap((section) => section.topics);
  const named = await topics.ensureTopics(targetId, names, transaction);
  const ids = named.map((topic) => topic.id);
  return targets.update(targetId, updateOf(state, ids), transaction);
}

async function applyIn(
  dependencies: TargetSetupDependencies,
  targetId: string,
  transaction: Transaction,
): Promise<ApplyOutcome> {
  const draft = await pending(dependencies, targetId, transaction);
  if (draft.outcome !== "ready") {
    return draft;
  }
  const target = await write(dependencies, { targetId, state: draft.state, transaction });
  if (target === undefined) {
    throw new Error("The Target disappeared while its draft was applied");
  }
  await dependencies.drafts.clear(targetId, transaction);
  return { outcome: "applied", target, changes: draft.changes };
}

/** Records the change in the Target's draft; null for an unknown Target. */
async function record(
  { drafts, targets, clock }: TargetSetupDependencies,
  targetId: string,
  operation: DraftOperation,
) {
  const target = await targets.get(targetId);
  if (target === undefined) {
    return null;
  }
  const change: DraftChange = {
    id: randomUUID(),
    targetId,
    operation,
    createdAt: clock.now().toISOString(),
  };
  await drafts.add(change);
  const draft = await drafts.changes(targetId);
  return { change, size: draft.length };
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
    /** Writes the whole draft to the Target in one transaction, or nothing. */
    apply: async (targetId: string): Promise<ApplyOutcome> =>
      transaction(async (opened) => applyIn(dependencies, targetId, opened)),
    /** Erases the Target's draft when the Target is deleted for good. */
    eraseTarget: async (targetId: string, opened: Transaction) => drafts.clear(targetId, opened),
    /** The brief of the Target's setup session; undefined for an unknown Target. */
    brief: async (targetId: string) => {
      const target = await targets.get(targetId);
      return target === undefined ? undefined : setupBrief(target);
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
