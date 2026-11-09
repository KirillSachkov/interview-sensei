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

/** The Target's agent: the Candidate's choice, or the default agent when `chosen` is false. */
export interface TargetAgent {
  /** Null when the Target has no choice and no agent is available. */
  readonly agent: string | null;
  readonly chosen: boolean;
}
