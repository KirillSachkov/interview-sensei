import { request } from "./request";
import { isTargetView } from "./targets";
import type { Level, TargetView } from "./targets";

/** One Section of the plan that the agent proposes; its Topics by name. An omitted field stays as it is. */
interface ProposedSection {
  readonly name: string;
  readonly kind: "conversation" | "topics" | "design";
  readonly gradingCriteria?: string;
  readonly enabled?: boolean;
  readonly topics?: readonly string[];
}

type Rating = "useful" | "irrelevant" | "wrong";

/** A new Question in the draft; its Topic by name. */
interface ProposedQuestion {
  readonly id: string;
  readonly topic: string;
  readonly text: string;
  readonly format: "open" | "quiz";
}

/** A change of the Target that the agent recorded in the draft. */
export type DraftOperation =
  | {
      readonly type: "update_target";
      readonly name?: string;
      readonly level?: Level;
      readonly tone?: "friendly" | "neutral" | "strict";
      readonly language?: string;
    }
  | {
      readonly type: "set_interview_plan";
      readonly sections: readonly ProposedSection[];
      readonly renameTopics?: readonly { readonly from: string; readonly to: string }[];
    }
  | {
      readonly type: "save_preference";
      readonly id: string;
      readonly text?: string;
      readonly active?: boolean;
    }
  | { readonly type: "add_questions"; readonly questions: readonly ProposedQuestion[] }
  | {
      readonly type: "edit_questions";
      readonly edits: readonly {
        readonly id: string;
        readonly text?: string;
        readonly topic?: string;
        readonly hidden?: boolean;
        readonly rating?: Rating | null;
      }[];
    };

/** One change of the draft of changes. */
export interface DraftChange {
  readonly id: string;
  readonly operation: DraftOperation;
}

/** The draft cannot be applied; the Target did not change. */
export class DraftProblemsError extends Error {
  readonly problems: readonly string[];

  constructor(problems: readonly string[]) {
    super(problems.join(" "));
    this.name = "DraftProblemsError";
    this.problems = problems;
  }
}

function isDraftChange(value: unknown): value is DraftChange {
  return (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    typeof value.id === "string" &&
    "operation" in value &&
    typeof value.operation === "object" &&
    value.operation !== null &&
    "type" in value.operation
  );
}

function draftUrl(targetId: string): string {
  return `/api/targets/${encodeURIComponent(targetId)}/draft`;
}

/** The Target's draft of changes in the order the agent recorded them. */
export async function fetchDraft(targetId: string): Promise<DraftChange[]> {
  const body = await request(draftUrl(targetId));
  const changes =
    typeof body === "object" && body !== null && "changes" in body ? body.changes : [];
  if (!Array.isArray(changes) || !changes.every((change: unknown) => isDraftChange(change))) {
    throw new Error("неожиданный ответ");
  }
  return changes;
}

function problemsOf(body: unknown): string[] {
  const problems =
    typeof body === "object" && body !== null && "problems" in body ? body.problems : [];
  return Array.isArray(problems) ? problems.map(String) : [];
}

/**
 * Writes the whole draft to the Target and returns the Target. Throws DraftProblemsError when the
 * draft cannot be applied.
 */
export async function applyDraft(targetId: string): Promise<TargetView> {
  const response = await fetch(`${draftUrl(targetId)}/apply`, { method: "POST" });
  const body: unknown = await response.json().catch(() => null);
  if (response.status === 409) {
    const problems = problemsOf(body);
    throw new DraftProblemsError(problems.length > 0 ? problems : ["Черновик пуст."]);
  }
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  if (!isTargetView(body)) {
    throw new Error("неожиданный ответ");
  }
  return body;
}

/** ✕: removes one change from the Target's draft; the others stay. A change already gone is fine. */
export async function removeDraftChange(targetId: string, changeId: string): Promise<void> {
  const response = await fetch(`${draftUrl(targetId)}/changes/${encodeURIComponent(changeId)}`, {
    method: "DELETE",
  });
  if (!response.ok && response.status !== 404) {
    throw new Error(`HTTP ${response.status}`);
  }
}

/** «Отменить изменения»: empties the Target's draft; the Target stays as it is. */
export async function discardDraft(targetId: string): Promise<void> {
  await request(draftUrl(targetId), { method: "DELETE" });
}
