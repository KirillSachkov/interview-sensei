// A new Interview plan in the draft of changes replaces the earlier plan changes, so the draft
// holds one plan: the latest one the agent proposed.
import type { DraftChange, DraftOperation } from "./draft.ts";
import { topicKey } from "./draft-topics.ts";
import type { TopicRename } from "./draft-topics.ts";

type PlanOperation = Extract<DraftOperation, { type: "set_interview_plan" }>;

const renameKey = ({ from, to }: TopicRename) => `${topicKey(from)}\n${topicKey(to)}`;

/** The renames in order, each pair of names once. */
function distinct(renames: readonly TopicRename[]): TopicRename[] {
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
 * Their Topic renames stay in the new change, before its own, so a rename the agent made earlier is
 * not lost; a rename the new plan restates is made once.
 */
export function planReplacement(
  changes: readonly DraftChange[],
  plan: PlanOperation,
): { readonly replaced: readonly string[]; readonly operation: PlanOperation } {
  const earlier = changes.flatMap((change) =>
    change.operation.type === "set_interview_plan"
      ? [{ id: change.id, renames: change.operation.renameTopics ?? [] }]
      : [],
  );
  const renames = distinct([
    ...earlier.flatMap((change) => change.renames),
    ...(plan.renameTopics ?? []),
  ]);
  const { renameTopics: _renames, ...rest } = plan;
  return {
    replaced: earlier.map((change) => change.id),
    operation: renames.length === 0 ? rest : { ...rest, renameTopics: renames },
  };
}
