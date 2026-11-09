// Inbox processing of spec #47: the setup agent proposes it, the Candidate starts it by a button, an
// agent of its own reads the Sources part by part, adds Questions to the bank and writes an Inbox
// report. The server keeps the statuses and counts what the agent added.

/** What an Inbox processing does: reads materials. Spec #47 adds the recheck of the bank later. */
export type InboxMode = "processing";

/** One material of the proposal: the setup agent's short assessment of what it will give. */
export interface ProposalItem {
  readonly sourceId: string;
  readonly assessment: string;
}

/**
 * The card «Разбор материалов» in the setup chat: `open` until the Candidate starts the processing
 * or answers «Не сейчас». A Target has at most one open proposal: a new one replaces it.
 */
export interface InboxProposal {
  readonly id: string;
  readonly targetId: string;
  readonly items: readonly ProposalItem[];
  readonly status: "open" | "started" | "dismissed";
  readonly createdAt: string;
}

/** An Inbox processing of a Target: `running` until the agent writes its Inbox report. */
export interface InboxRun {
  readonly id: string;
  readonly targetId: string;
  /** The AgentSession of kind `inbox-processing`; null until it starts. */
  readonly sessionId: string | null;
  readonly mode: InboxMode;
  readonly status: "running" | "finished";
  /** The Sources it processes, in the order of the Target's materials. */
  readonly sourceIds: readonly string[];
  /** The Questions the agent added to the bank, in the order it added them. */
  readonly questionIds: readonly string[];
  /** How many of the agent's Questions the server left out as duplicates. */
  readonly duplicates: number;
  readonly startedAt: string;
  readonly finishedAt: string | null;
}

/** A Question the agent doubts: added or not, with the reason. */
export interface DoubtfulQuestion {
  readonly questionId: string | null;
  readonly text: string;
  readonly reason: string;
}

/** What the agent proposes but never applies itself: new Sections and Preferences. */
export interface ReportProposals {
  readonly sections: readonly {
    readonly name: string;
    readonly kind: "conversation" | "topics" | "design";
    readonly reason: string;
  }[];
  readonly preferences: readonly { readonly text: string; readonly reason: string }[];
}

/**
 * The Inbox report of one Inbox processing: the processed Sources, the added Questions and the
 * duplicates the server counted, and the agent's summary, doubts and proposals. `partial` when the
 * processing ended before the agent wrote the report.
 */
export interface InboxReport {
  readonly id: string;
  readonly targetId: string;
  readonly runId: string;
  readonly mode: InboxMode;
  readonly sourceIds: readonly string[];
  readonly questionIds: readonly string[];
  readonly duplicates: number;
  readonly summary: string;
  readonly doubtful: readonly DoubtfulQuestion[];
  readonly proposals: ReportProposals;
  readonly partial: boolean;
  readonly createdAt: string;
}

/** The server or the agent could not read the Source; the reason is in Russian. */
export class UnreadableSourceError extends Error {
  override name = "UnreadableSourceError";
}

/** The first message of an Inbox processing session; the agent knows it by its first sentence. */
export const inboxOpening = [
  "Inbox processing has started.",
  "Call get_brief, then read every material of list_inbox part by part with read_source.",
  "Add Questions with add_bank_questions as you go and finish with write_inbox_report.",
].join(" ");

/** What the brief of an Inbox processing reads of its Target. */
export interface BriefTarget {
  readonly name: string;
  readonly level: string | null;
  readonly sections: readonly {
    readonly id: string;
    readonly name: string;
    readonly kind: string;
    readonly enabled: boolean;
    readonly topics: readonly { readonly id: string; readonly name: string }[];
  }[];
  readonly preferences: readonly { readonly text: string }[];
}

/** A material of the processing as the brief lists it. */
export interface BriefSource {
  readonly id: string;
  readonly type: string;
  readonly title: string;
  readonly status: string;
  readonly parts: number | null;
  readonly failure: string | null;
}

/** The brief of an Inbox processing session: its mode, the rules, the Target and the materials. */
export function inboxBrief(
  target: BriefTarget,
  { mode, sources }: { mode: InboxMode; sources: readonly BriefSource[] },
): string {
  return [
    `Mode: ${mode}. You process the Target's materials in the background; the Candidate does not read your messages.`,
    "Read each material with read_source, part by part, from part 1 to its last part: never skip a part.",
    "Add Questions with add_bank_questions into the Topics of the Sections below, with the Source and the part each comes from, its level and the Section kind.",
    "Give a reference answer only from the material itself: 3–5 key points and a short sample answer. Without an answer in the material, give none.",
    "Create a missing Topic with create_topic inside an existing Section. Never change Sections or the plan: propose new Sections and Preferences in the report.",
    "Follow the active Preferences. Finish with write_inbox_report: a short summary in Russian, the Questions you doubt and your proposals.",
    "",
    "Target:",
    JSON.stringify({
      name: target.name,
      level: target.level,
      sections: target.sections,
      preferences: target.preferences.map((preference) => preference.text),
    }),
    "",
    "Materials of this processing:",
    JSON.stringify(sources),
  ].join("\n");
}
