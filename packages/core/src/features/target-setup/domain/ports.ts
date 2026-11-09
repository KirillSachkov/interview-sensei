import type { DraftChange, Level, SectionKind, Tone } from "./draft.ts";

/**
 * Stores the draft of changes of each Target, in the order of recording. `Transaction` is the
 * storage's open transaction, opaque to the domain: applying the draft clears it in the same
 * transaction that writes the Target.
 */
export interface DraftRepository<Transaction> {
  readonly add: (change: DraftChange) => Promise<void>;
  readonly changes: (
    targetId: string,
    transaction?: Transaction,
  ) => Promise<readonly DraftChange[]>;
  readonly clear: (targetId: string, transaction: Transaction) => Promise<void>;
}

/** A Target as target-setup reads it: its fields and its Interview plan with Topic names. */
export interface SetupTarget {
  readonly id: string;
  readonly name: string;
  readonly level: Level | null;
  readonly tone: Tone;
  readonly language: string;
  readonly status: "draft" | "active" | "archived";
  readonly sections: readonly {
    readonly id: string;
    readonly name: string;
    readonly kind: SectionKind;
    readonly gradingCriteria: string;
    readonly enabled: boolean;
    readonly topics: readonly { readonly id: string; readonly name: string }[];
  }[];
}

/** The Target's state after the draft: Sections in order, with their Topics by id. */
export interface TargetUpdate {
  readonly name: string;
  readonly level: Level | null;
  readonly tone: Tone;
  readonly language: string;
  readonly status: SetupTarget["status"];
  readonly sections: readonly {
    readonly id: string;
    readonly position: number;
    readonly name: string;
    readonly kind: SectionKind;
    readonly gradingCriteria: string;
    readonly enabled: boolean;
    readonly topicIds: readonly string[];
  }[];
}

/** The targets slice reads the Target and writes its new state in the given transaction. */
export interface SetupTargets<Transaction> {
  readonly get: (id: string, transaction?: Transaction) => Promise<SetupTarget | undefined>;
  /** Resolves undefined when the Target does not exist. */
  readonly update: (
    id: string,
    change: TargetUpdate,
    transaction?: Transaction,
  ) => Promise<SetupTarget | undefined>;
}

/** The question-bank slice gives the Target's Topic of each name and creates the missing ones. */
export interface SetupTopics<Transaction> {
  /** One Topic per name, in the order of the names; the same Topic for names that match. */
  readonly ensureTopics: (
    targetId: string,
    names: readonly string[],
    transaction?: Transaction,
  ) => Promise<readonly { readonly id: string; readonly name: string }[]>;
}
