// The draft of changes: the agent of a Target setup session records its changes of the Target here
// instead of changing the Target. Applying the draft turns its operations into the Target's new
// state and writes that state at once.
import { editedQuestions, questionProblems } from "./draft-questions.ts";
import type { DraftQuestion, NewQuestion, QuestionEdit } from "./draft-questions.ts";
import { savedPreference } from "./draft-preferences.ts";
import type { DraftPreference, PreferenceChange } from "./draft-preferences.ts";
import { namesTopic, renamedTopics, topicKey } from "./draft-topics.ts";
import type { TopicRename } from "./draft-topics.ts";

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

/**
 * A Section as the agent proposes it in a plan. An omitted field keeps the value of the Section with
 * that name; a new Section takes no criteria, no Topics and is enabled.
 */
interface ProposedSection {
  readonly name: string;
  readonly kind: SectionKind;
  readonly gradingCriteria?: string | undefined;
  readonly enabled?: boolean | undefined;
  readonly topics?: readonly string[] | undefined;
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
  /** The names of all the Target's Topics, in the plan or not. */
  readonly topics: readonly string[];
  /** The Topic renames and merges that applying makes, in order. */
  readonly topicRenames: readonly TopicRename[];
  readonly preferences: readonly DraftPreference[];
  /** Every Question of the Target, hidden ones too, with the new ones of the draft. */
  readonly questions: readonly DraftQuestion[];
  /** The changes of things the Target does not have, for the Candidate and the agent. */
  readonly missing: readonly string[];
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
  | {
      readonly type: "set_interview_plan";
      readonly sections: readonly ProposedSection[];
      /** Topic renames and merges, made before the plan's Topics are created. */
      readonly renameTopics?: readonly TopicRename[];
    }
  | ({ readonly type: "save_preference" } & PreferenceChange)
  | { readonly type: "add_questions"; readonly questions: readonly NewQuestion[] }
  | { readonly type: "edit_questions"; readonly edits: readonly QuestionEdit[] };

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

/**
 * The new plan replaces the old one. A Section with the name of an old one keeps its id and the
 * values that the plan leaves out.
 */
function withPlan(state: SetupState, sections: readonly ProposedSection[]): SetupState {
  const current = new Map(state.sections.map((section) => [sectionKey(section.name), section]));
  return {
    ...state,
    sections: sections.map((section) => {
      const kept = current.get(sectionKey(section.name));
      return {
        id: kept?.id ?? null,
        name: section.name,
        kind: section.kind,
        gradingCriteria: section.gradingCriteria ?? kept?.gradingCriteria ?? "",
        enabled: section.enabled ?? kept?.enabled ?? true,
        topics: section.topics ?? kept?.topics ?? [],
      };
    }),
  };
}

/** Every name of the Topic `from` becomes `to`; a missing Topic is a problem. */
function withRename(state: SetupState, rename: TopicRename): SetupState {
  const named = [
    ...state.topics,
    ...state.sections.flatMap((section) => section.topics),
    ...state.questions.map((question) => question.topic),
  ];
  if (!namesTopic(named, rename.from)) {
    return { ...state, missing: [...state.missing, `Темы «${rename.from.trim()}» нет в цели.`] };
  }
  const renamed = (name: string) => (topicKey(name) === topicKey(rename.from) ? rename.to : name);
  return {
    ...state,
    sections: state.sections.map((section) => ({
      ...section,
      topics: renamedTopics(section.topics, rename),
    })),
    topics: renamedTopics(state.topics, rename),
    topicRenames: [...state.topicRenames, rename],
    questions: state.questions.map((question) => ({ ...question, topic: renamed(question.topic) })),
  };
}

function withPreference(state: SetupState, change: PreferenceChange): SetupState {
  const saved = savedPreference(state.preferences, change);
  const unknown = (change.rejectedQuestionIds ?? [])
    .filter((id) => !state.questions.some((question) => question.id === id))
    .map((id) => `Вопроса ${id} нет в цели.`);
  return {
    ...state,
    preferences: saved.preferences,
    missing: [...state.missing, ...saved.missing, ...unknown],
  };
}

function withEdits(state: SetupState, edits: readonly QuestionEdit[]): SetupState {
  const edited = editedQuestions(state.questions, edits);
  return { ...state, questions: edited.questions, missing: [...state.missing, ...edited.missing] };
}

function applyOperation(state: SetupState, operation: DraftOperation): SetupState {
  switch (operation.type) {
    case "update_target": {
      const { type: _type, ...fields } = operation;
      return { ...state, ...fields };
    }
    case "set_interview_plan": {
      return (operation.renameTopics ?? []).reduce(
        (current, rename) => withRename(current, rename),
        withPlan(state, operation.sections),
      );
    }
    case "save_preference": {
      const { type: _type, ...change } = operation;
      return withPreference(state, change);
    }
    case "add_questions": {
      const added = operation.questions.map((question) => ({
        ...question,
        hidden: false,
        rating: null,
      }));
      return { ...state, questions: [...state.questions, ...added] };
    }
    case "edit_questions": {
      return withEdits(state, operation.edits);
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
  const problems = [...planProblems(state.sections), ...state.missing];
  if (state.status !== "draft" && state.name.trim() === "") {
    problems.push("У активной цели должно быть название.");
  }
  return [...problems, ...questionProblems(state.questions, state.level)];
}
