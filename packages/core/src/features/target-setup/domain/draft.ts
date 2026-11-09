// The draft of changes: the agent of a Target setup session records its changes of the Target here
// instead of changing the Target. Applying the draft turns its operations into the Target's new
// state and writes that state at once.

export type Level = "junior" | "middle" | "senior";
export type Tone = "friendly" | "neutral" | "strict";
export type SectionKind = "conversation" | "topics" | "design";
type TargetStatus = "draft" | "active" | "archived";

/** One Section of the Interview plan as the draft sees it: its Topics by name. */
export interface PlanSection {
  readonly name: string;
  readonly kind: SectionKind;
  readonly gradingCriteria: string;
  readonly enabled: boolean;
  /** Topic names in order; applying the draft creates the missing Topics. */
  readonly topics: readonly string[];
}

/** What a draft can change in a Target. */
export interface SetupState {
  readonly name: string;
  readonly level: Level | null;
  readonly tone: Tone;
  readonly language: string;
  readonly status: TargetStatus;
  /** The Interview plan in order; `id` is null for a Section that applying creates. */
  readonly sections: readonly (PlanSection & { readonly id: string | null })[];
}

/**
 * One change in the draft. Each operation type changes the state in `applyOperation`; a new type
 * adds its case there and its MCP tool.
 */
export type DraftOperation =
  | {
      readonly type: "update_target";
      readonly name?: string;
      readonly level?: Level;
      readonly tone?: Tone;
      readonly language?: string;
    }
  | { readonly type: "set_interview_plan"; readonly sections: readonly PlanSection[] };

/** A recorded change of the draft of one Target. */
export interface DraftChange {
  readonly id: string;
  readonly targetId: string;
  readonly operation: DraftOperation;
  /** ISO 8601. */
  readonly createdAt: string;
}

/** The key two Section names match by: the same words, ignoring case and spaces around them. */
function sectionKey(name: string): string {
  return name.trim().replaceAll(/\s+/gu, " ").toLowerCase();
}

/** The new plan replaces the old one; a Section with the name of an old one keeps its id. */
function withPlan(state: SetupState, sections: readonly PlanSection[]): SetupState {
  const ids = new Map(state.sections.map((section) => [sectionKey(section.name), section.id]));
  return {
    ...state,
    sections: sections.map((section) => ({
      id: ids.get(sectionKey(section.name)) ?? null,
      ...section,
    })),
  };
}

function applyOperation(state: SetupState, operation: DraftOperation): SetupState {
  switch (operation.type) {
    case "update_target": {
      const { type: _type, ...fields } = operation;
      return { ...state, ...fields };
    }
    case "set_interview_plan": {
      return withPlan(state, operation.sections);
    }
    default: {
      return operation satisfies never;
    }
  }
}

/** A draft Target becomes active once it has a name, a level and an enabled Section. */
function activated(state: SetupState): SetupState {
  const ready =
    state.name.trim() !== "" &&
    state.level !== null &&
    state.sections.some((section) => section.enabled);
  return state.status === "draft" && ready ? { ...state, status: "active" } : state;
}

/** The Target's state after the operations in their order, with the activation rule. */
export function stateAfter(state: SetupState, operations: readonly DraftOperation[]): SetupState {
  return activated(
    operations.reduce((current, operation) => applyOperation(current, operation), state),
  );
}

/** The names that occur more than once by sectionKey, each once, as first written. */
function repeatedNames(names: readonly string[]): readonly string[] {
  const first = new Map<string, string>();
  const repeated = new Set<string>();
  for (const name of names) {
    const key = sectionKey(name);
    if (first.has(key)) {
      repeated.add(key);
    } else {
      first.set(key, name.trim());
    }
  }
  return [...repeated].map((key) => first.get(key) ?? key);
}

/** Why the plan cannot be recorded or applied; empty when it can. */
export function planProblems(sections: readonly Pick<PlanSection, "name">[]): string[] {
  return repeatedNames(sections.map((section) => section.name)).map(
    (name) => `В плане несколько секций с названием «${name}».`,
  );
}

/** Why the state cannot be applied, for the Candidate and the agent; empty when it can. */
export function draftProblems(state: SetupState): readonly string[] {
  const problems = planProblems(state.sections);
  if (state.status !== "draft" && state.name.trim() === "") {
    problems.push("У активной цели должно быть название.");
  }
  return problems;
}
