import type { Preference, Section, Target, TargetUpdate, TopicSummary } from "./target.ts";

/**
 * `Transaction` is the storage's open transaction, opaque to the domain: a write joins it when the
 * server applies the changes of several slices at once.
 */
export interface TargetRepository<Transaction> {
  readonly create: (
    target: Target,
    sections: readonly Section[],
    preferences: readonly Preference[],
  ) => Promise<void>;
  readonly get: (id: string, transaction?: Transaction) => Promise<Target | undefined>;
  readonly list: () => Promise<readonly Pick<Target, "id" | "name" | "status" | "level">[]>;
  readonly activeDemo: () => Promise<Target | undefined>;
  /** Stores the Target's agent; resolves false when the Target does not exist. */
  readonly setAgent: (id: string, agent: string | null) => Promise<boolean>;
  /**
   * Stores the Target's fields and status and replaces its Interview plan with `sections`;
   * resolves false when the Target does not exist.
   */
  readonly update: (
    id: string,
    update: Omit<TargetUpdate, "sections"> & { readonly sections: readonly Section[] },
    transaction?: Transaction,
  ) => Promise<boolean>;
  readonly sections: (targetId: string, transaction?: Transaction) => Promise<readonly Section[]>;
  readonly preferences: (
    targetId: string,
    transaction?: Transaction,
  ) => Promise<readonly Preference[]>;
}
/** The question-bank slice supplies Target-scoped Topics and their Question counts. */
export interface TargetTopics<Transaction> {
  readonly topics: (
    targetId: string,
    transaction?: Transaction,
  ) => Promise<readonly TopicSummary[]>;
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
