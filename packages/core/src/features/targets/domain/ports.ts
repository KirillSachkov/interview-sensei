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
  /** The Targets that are not archived, the oldest first. */
  readonly list: () => Promise<readonly Pick<Target, "id" | "name" | "status" | "level">[]>;
  /** The archived Targets, the oldest first. */
  readonly archived: () => Promise<readonly Pick<Target, "id" | "name" | "status" | "level">[]>;
  /** Stores the Target's status; resolves false when the Target does not exist. */
  readonly setStatus: (id: string, status: Target["status"]) => Promise<boolean>;
  /** Erases the Target with its Interview plan and Preferences in the open transaction. */
  readonly erase: (id: string, transaction: Transaction) => Promise<void>;
  readonly activeDemo: () => Promise<Target | undefined>;
  /** Stores the Target's agent; resolves false when the Target does not exist. */
  readonly setAgent: (id: string, agent: string | null) => Promise<boolean>;
  /** Switches the Target's Section on or off; resolves false when it has no such Section. */
  readonly setSectionEnabled: (
    targetId: string,
    sectionId: string,
    enabled: boolean,
  ) => Promise<boolean>;
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
  /** Inserts new Preferences; stores the text, examples and activity of existing ones. */
  readonly savePreferences: (
    preferences: readonly Preference[],
    transaction?: Transaction,
  ) => Promise<void>;
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

/** The app-settings slice supplies the default agent of Targets without their own agent. */
export interface DefaultAgent {
  /** Null when the Candidate has not chosen a default agent. */
  readonly defaultAgent: () => Promise<string | null>;
}
