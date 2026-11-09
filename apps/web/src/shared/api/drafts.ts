import { isTargetView } from "./targets";
import type { TargetView } from "./targets";

type Level = "junior" | "middle" | "senior";

/** One Section of the plan that the agent proposes; its Topics by name. */
interface ProposedSection {
  readonly name: string;
  readonly kind: "conversation" | "topics" | "design";
  readonly gradingCriteria: string;
  readonly enabled: boolean;
  readonly topics: readonly string[];
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
  | { readonly type: "set_interview_plan"; readonly sections: readonly ProposedSection[] };

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
  const response = await fetch(draftUrl(targetId));
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  const body: unknown = await response.json();
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
