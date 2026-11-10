// A new Interview plan in the draft of changes replaces the earlier plan changes, so the draft
// holds one plan: the latest one the agent proposed. The Candidate reads «объединить» for a Topic
// rename of the plan that merges Topics instead of «переименовать».
import { namedTopics, stateAfter } from "./draft.ts";
import type { DraftChange, DraftOperation, SetupState } from "./draft.ts";
import type { SectionRename } from "./draft-sections.ts";
import { namesTopic, renamedTopics, topicKey } from "./draft-topics.ts";
import type { TopicRename } from "./draft-topics.ts";

type PlanOperation = Extract<DraftOperation, { type: "set_interview_plan" }>;

const renameKey = ({ from, to }: TopicRename | SectionRename) =>
  `${topicKey(from)}\n${topicKey(to)}`;

/** The renames in order, each pair of names once. */
function distinct<Rename extends TopicRename | SectionRename>(
  renames: readonly Rename[],
): Rename[] {
  const seen = new Set<string>();
  return renames.filter((rename) => {
    const key = renameKey(rename);
    const first = !seen.has(key);
    seen.add(key);
    return first;
  });
}

/**
 * The plan change to record in place of the draft's earlier plan changes, which `replaced` lists.
 * Their Topic and Section renames stay in the new change, before its own, so a rename the agent
 * made earlier is not lost; a rename the new plan restates is made once.
 */
export function planReplacement(
  changes: readonly DraftChange[],
  plan: PlanOperation,
): { readonly replaced: readonly string[]; readonly operation: PlanOperation } {
  const earlier = changes.flatMap((change) =>
    change.operation.type === "set_interview_plan"
      ? [
          {
            id: change.id,
            renames: change.operation.renameTopics ?? [],
            sectionRenames: change.operation.renameSections ?? [],
          },
        ]
      : [],
  );
  const renames = distinct([
    ...earlier.flatMap((change) => change.renames),
    ...(plan.renameTopics ?? []),
  ]);
  const sectionRenames = distinct([
    ...earlier.flatMap((change) => change.sectionRenames),
    ...(plan.renameSections ?? []),
  ]);
  const { renameTopics: _renames, renameSections: _sectionRenames, ...rest } = plan;
  return {
    replaced: earlier.map((change) => change.id),
    operation: {
      ...rest,
      ...(sectionRenames.length === 0 ? {} : { renameSections: sectionRenames }),
      ...(renames.length === 0 ? {} : { renameTopics: renames }),
    },
  };
}

/** The `from` names of the renames that merge into a Topic the state already knows, in order. */
function mergesOf(state: SetupState, renames: readonly TopicRename[]): readonly string[] {
  let names = namedTopics(state);
  const merges: string[] = [];
  for (const rename of renames) {
    if (topicKey(rename.from) !== topicKey(rename.to) && namesTopic(names, rename.to)) {
      merges.push(rename.from);
    }
    names = renamedTopics(names, rename);
  }
  return merges;
}

/** A change of the draft as the Candidate and the agent see it; `merges` as changeViews gives. */
export type DraftChangeView = DraftChange & { readonly merges?: readonly string[] };

/**
 * The draft's changes, each plan change with the `from` names of its renames that merge Topics: a
 * rename merges when its new name is a Topic of the state before the change.
 */
export function changeViews(state: SetupState, changes: readonly DraftChange[]): DraftChangeView[] {
  return changes.map((change, index) => {
    const { operation } = change;
    if (operation.type !== "set_interview_plan") {
      return change;
    }
    const before = stateAfter(
      state,
      changes.slice(0, index).map((earlier) => earlier.operation),
    );
    const merges = mergesOf(before, operation.renameTopics ?? []);
    return merges.length === 0 ? change : { ...change, merges };
  });
}
