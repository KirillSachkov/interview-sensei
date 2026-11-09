// What the agent of an Inbox processing reads first: the opening message and the brief of its mode.
import type { InboxMode } from "./inbox.ts";

/** The first message of an Inbox processing session; the agent knows it by its first sentence. */
export const inboxOpening = [
  "Inbox processing has started.",
  "Call get_brief, then read every material of list_inbox part by part with read_source.",
  "Add Questions with add_bank_questions as you go and finish with write_inbox_report.",
].join(" ");

/** The first message of a recheck session; the agent knows it by its first sentence. */
export const recheckOpening = [
  "Recheck of the question bank has started.",
  "Call get_brief: it lists the Target's visible Questions and its active Preferences.",
  "Change nothing; finish with write_inbox_report and list the Questions to hide in proposals.hide.",
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
  /** The link of a web page; null for a file. */
  readonly url: string | null;
  readonly status: string;
  /** Null for a web page the server could not read. */
  readonly parts: number | null;
  readonly failure: string | null;
}

/** A visible Question of the bank as the brief of a recheck lists it. */
export interface BriefQuestion {
  readonly id: string;
  readonly topicId: string;
  readonly text: string;
  readonly level: string;
}

/** The Target as the brief prints it. */
function targetLines(target: BriefTarget): string[] {
  return [
    "Target:",
    JSON.stringify({
      name: target.name,
      level: target.level,
      sections: target.sections,
      preferences: target.preferences.map((preference) => preference.text),
    }),
  ];
}

/** The brief of a recheck: the rules, the Target with its Preferences and the visible Questions. */
function recheckBrief(target: BriefTarget, questions: readonly BriefQuestion[]): string {
  return [
    "Mode: recheck. You recheck the Target's question bank in the background against its active Preferences; the Candidate does not read your messages.",
    "Change nothing: add_bank_questions and create_topic are refused in a recheck, and you hide nothing yourself.",
    "Finish with write_inbox_report: a short summary in Russian and, in proposals.hide, each Question that an active Preference rejects, by its id, with the reason in Russian naming the Preference.",
    "The Candidate reads the list «скрыть?» and hides the Questions they agree with.",
    "",
    ...targetLines(target),
    "",
    "Visible Questions of the bank:",
    JSON.stringify(questions),
  ].join("\n");
}

/**
 * The brief of an Inbox processing session: its mode, the rules, the Target and the materials; for
 * a recheck, the Target's visible Questions instead of the materials.
 */
export function inboxBrief(
  target: BriefTarget,
  {
    mode,
    sources,
    questions,
  }: {
    mode: InboxMode;
    sources: readonly BriefSource[];
    questions: readonly BriefQuestion[];
  },
): string {
  if (mode === "recheck") {
    return recheckBrief(target, questions);
  }
  return [
    `Mode: ${mode}. You process the Target's materials in the background; the Candidate does not read your messages.`,
    "Read each material with read_source, part by part, from part 1 to its last part: never skip a part.",
    "A web page whose parts are null is one the server could not read: open its url on the web and add its Questions without a part, or call mark_source_failed when it does not open.",
    "Add Questions with add_bank_questions into the Topics of the Sections below, with the Source and the part each comes from, its level and the Section kind.",
    "Give a reference answer only from the material itself: 3–5 key points and a short sample answer. Without an answer in the material, give none.",
    "Create a missing Topic with create_topic inside an existing Section. Never change Sections or the plan: propose new Sections and Preferences in the report.",
    "Follow the active Preferences. Finish with write_inbox_report: a short summary in Russian, the Questions you doubt and your proposals.",
    "",
    ...targetLines(target),
    "",
    "Materials of this processing:",
    JSON.stringify(sources),
  ].join("\n");
}
