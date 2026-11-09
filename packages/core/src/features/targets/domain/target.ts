export type TargetStatus = "draft" | "active" | "archived";
export type Level = "junior" | "middle" | "senior";
export interface Target {
  readonly id: string;
  readonly name: string;
  readonly status: TargetStatus;
  readonly level: Level | null;
  readonly agent: string | null;
  readonly tone: "friendly" | "neutral" | "strict";
  readonly language: string;
  readonly demo: boolean;
  readonly createdAt: string;
}
export interface Section {
  readonly id: string;
  readonly targetId: string;
  readonly position: number;
  readonly name: string;
  readonly kind: "conversation" | "topics" | "design";
  readonly gradingCriteria: string;
  readonly enabled: boolean;
  readonly topicIds: readonly string[];
}
export interface Preference {
  readonly id: string;
  readonly targetId: string;
  readonly text: string;
  readonly rejectedQuestionIds: readonly string[];
  readonly active: boolean;
  readonly createdAt: string;
}
export interface TopicSummary {
  readonly id: string;
  readonly targetId: string;
  readonly name: string;
  readonly questionCount: number;
}
export interface TargetView extends Target {
  readonly sections: readonly (Section & { readonly topics: readonly TopicSummary[] })[];
  readonly preferences: readonly Preference[];
}
export interface NewTarget {
  readonly id?: string;
  readonly name?: string;
  readonly status?: TargetStatus;
  readonly level?: Level | null;
  readonly agent?: string | null;
  readonly tone?: Target["tone"];
  readonly language?: string;
  readonly demo?: boolean;
  readonly sections?: readonly Omit<Section, "targetId">[];
  readonly preferences?: readonly Omit<Preference, "targetId" | "createdAt">[];
}

/**
 * The Target after its setup changed: its fields, its status and its whole Interview plan, which
 * replaces the old one. Sections keep their ids; Sections missing from the plan go away.
 */
export interface TargetUpdate {
  readonly name: string;
  readonly level: Level | null;
  readonly tone: Target["tone"];
  readonly language: string;
  readonly status: TargetStatus;
  readonly sections: readonly Omit<Section, "targetId">[];
}

/** The Target's agent: the Candidate's choice, or the default agent when `chosen` is false. */
export interface TargetAgent {
  /** Null when the Target has no choice and no agent is available. */
  readonly agent: string | null;
  readonly chosen: boolean;
}

/** Why the Target cannot go to the archive: a draft is deleted instead, an archived one is there. */
export function archiveProblem(target: Target): "target_draft" | "target_archived" | null {
  switch (target.status) {
    case "draft": {
      return "target_draft";
    }
    case "archived": {
      return "target_archived";
    }
    case "active": {
      return null;
    }
    default: {
      return target.status satisfies never;
    }
  }
}

/**
 * Why the Target cannot be deleted for good: an active Target goes to the archive first, and an
 * archived one needs its exact name typed. A draft goes at once, without a name.
 */
export function deletionProblem(
  target: Target,
  typedName: string | undefined,
): "target_active" | "name_mismatch" | null {
  switch (target.status) {
    case "draft": {
      return null;
    }
    case "active": {
      return "target_active";
    }
    case "archived": {
      return typedName?.trim() === target.name.trim() ? null : "name_mismatch";
    }
    default: {
      return target.status satisfies never;
    }
  }
}
