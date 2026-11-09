// Inbox processing of spec #47: the setup agent proposes it, the Candidate starts it by a button, an
// agent of its own reads the Sources part by part, adds Questions to the bank and writes an Inbox
// report. The server keeps the statuses and counts what the agent added.
import type { SourceStatus } from "./source.ts";

/**
 * What an Inbox processing does: `processing` reads materials into Questions; `recheck` reads the
 * bank against the active Preferences and only proposes Questions to hide.
 */
export type InboxMode = "processing" | "recheck";

/** One material of the proposal: the setup agent's short assessment of what it will give. */
export interface ProposalItem {
  readonly sourceId: string;
  readonly assessment: string;
}

/**
 * A card in the setup chat: «Разбор материалов» for `processing`, «Перепроверка базы» for
 * `recheck`. It stays `open` until the Candidate starts it or answers «Не сейчас». A Target has at
 * most one open proposal of each mode: a new one replaces it.
 */
export interface InboxProposal {
  readonly id: string;
  readonly targetId: string;
  readonly mode: InboxMode;
  /** The materials of a processing; none for a recheck. */
  readonly items: readonly ProposalItem[];
  /** Why the setup agent proposes a recheck, such as the new Preference; null for a processing. */
  readonly reason: string | null;
  readonly status: "open" | "started" | "dismissed";
  readonly createdAt: string;
}

/**
 * An Inbox processing of a Target: `running` until the agent writes its Inbox report, or until the
 * server closes it with a partial one: on «Остановить разбор», when the agent fails or does not
 * start, after a restart of the server, or when the server could not read any material.
 */
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
  /** The parts of each Source that the agent read with read_source, by Source id. */
  readonly readParts: Readonly<Record<string, readonly number[]>>;
  readonly startedAt: string;
  readonly finishedAt: string | null;
}

/** A Question the agent doubts: added or not, with the reason. */
export interface DoubtfulQuestion {
  readonly questionId: string | null;
  readonly text: string;
  readonly reason: string;
}

/**
 * What the agent proposes but never applies itself: new Sections and Preferences, and the list
 * «скрыть?» of a recheck, which the Candidate accepts with a bulk action.
 */
export interface ReportProposals {
  readonly sections: readonly {
    readonly name: string;
    readonly kind: "conversation" | "topics" | "design";
    readonly reason: string;
  }[];
  readonly preferences: readonly { readonly text: string; readonly reason: string }[];
  readonly hide: readonly { readonly questionId: string; readonly reason: string }[];
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

/**
 * Why the server closed a run with a partial Inbox report:
 * - `stopped`: the Candidate pressed «Остановить разбор»;
 * - `agent_failed`: the agent's process failed;
 * - `interrupted`: the server stopped while the run ran;
 * - `agent_not_started`: the agent did not start;
 * - `nothing_readable`: the server could not read the text of any material.
 */
export type RunEnding =
  "stopped" | "agent_failed" | "interrupted" | "agent_not_started" | "nothing_readable";

const endings: Readonly<Record<RunEnding, string>> = {
  stopped: "Разбор остановлен кандидатом.",
  agent_failed: "Агент разбора упал.",
  interrupted: "Разбор прерван: приложение перезапустилось.",
  agent_not_started: "Агент разбора не запустился.",
  nothing_readable: "Сервер не смог прочитать ни один материал: причина — у каждого материала.",
};

/** Why a recheck ended early: it reads no materials. */
const recheckEndings: Readonly<Record<RunEnding, string>> = {
  stopped: "Перепроверка остановлена кандидатом.",
  agent_failed: "Агент перепроверки упал.",
  interrupted: "Перепроверка прервана: приложение перезапустилось.",
  agent_not_started: "Агент перепроверки не запустился.",
  nothing_readable: "Перепроверка не началась.",
};

/** The summary of a partial report: why the run ended and what it got done. */
function partialSummary(
  run: InboxRun,
  {
    reason,
    ready,
    back,
    failed,
  }: { reason: RunEnding; ready: number; back: number; failed: number },
): string {
  if (run.mode === "recheck") {
    return `${recheckEndings[reason]} Список «скрыть?» не готов: запустите её снова.`;
  }
  return [
    endings[reason],
    `Разобрано полностью: ${ready} из ${run.sourceIds.length}.`,
    ...(back > 0 ? [`Вернулись в Inbox: ${back}.`] : []),
    ...(failed > 0 ? [`С ошибкой: ${failed}.`] : []),
  ].join(" ");
}

/** A Source of the run as the partial report reads it. */
export interface RunSource {
  readonly id: string;
  readonly status: SourceStatus;
  readonly parts: number | null;
}

/** Whether the agent read every part of the Source's text. */
function readWhole(run: InboxRun, { id, parts }: RunSource): boolean {
  const read = new Set(run.readParts[id]);
  return (
    parts !== null &&
    Array.from({ length: parts }, (_item, index) => index + 1).every((part) => read.has(part))
  );
}

/**
 * The partial Inbox report of a run the server closes without the agent's report, from what the
 * agent wrote: its Questions and duplicates stay. Of the Sources still «разбирается», those whose
 * every part the agent read become «готов» (`ready`); the rest go back to the Inbox (`back`). A
 * Source with «ошибка» keeps it.
 */
export function partialReport(
  run: InboxRun,
  sources: readonly RunSource[],
  { id, reason, createdAt }: { id: string; reason: RunEnding; createdAt: string },
): { readonly report: InboxReport; readonly ready: string[]; readonly back: string[] } {
  const own = sources.filter((source) => run.sourceIds.includes(source.id));
  const processing = own.filter((source) => source.status === "processing");
  const ready = processing.filter((source) => readWhole(run, source)).map((source) => source.id);
  const back = processing.map((source) => source.id).filter((source) => !ready.includes(source));
  const failed = own.filter((source) => source.status === "failed").length;
  const summary = partialSummary(run, {
    reason,
    ready: ready.length,
    back: back.length,
    failed,
  });
  const report: InboxReport = {
    id,
    targetId: run.targetId,
    runId: run.id,
    mode: run.mode,
    sourceIds: run.sourceIds,
    questionIds: run.questionIds,
    duplicates: run.duplicates,
    summary,
    doubtful: [],
    proposals: { sections: [], preferences: [], hide: [] },
    partial: true,
    createdAt,
  };
  return { report, ready, back };
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
  readonly status: string;
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
