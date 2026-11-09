import type { Preference, Section, Target, TopicSummary } from "./target.ts";

export interface TargetRepository {
  readonly create: (
    target: Target,
    sections: readonly Section[],
    preferences: readonly Preference[],
  ) => Promise<void>;
  readonly get: (id: string) => Promise<Target | undefined>;
  readonly list: () => Promise<readonly Pick<Target, "id" | "name" | "status" | "level">[]>;
  readonly activeDemo: () => Promise<Target | undefined>;
  /** Stores the Target's agent; resolves false when the Target does not exist. */
  readonly setAgent: (id: string, agent: string | null) => Promise<boolean>;
  readonly sections: (targetId: string) => Promise<readonly Section[]>;
  readonly preferences: (targetId: string) => Promise<readonly Preference[]>;
}
/** The question-bank slice supplies Target-scoped Topics and their Question counts. */
export interface TargetTopics {
  readonly topics: (targetId: string) => Promise<readonly TopicSummary[]>;
}

/** An agent the server offers; it may be unavailable on this machine now. */
interface OfferedAgent {
  readonly agent: string;
  readonly available: boolean;
}

/** The agent-runtime slice supplies the agents the server offers, in the order of preference. */
export interface TargetAgents {
  readonly listAgents: () => Promise<readonly OfferedAgent[]>;
}
