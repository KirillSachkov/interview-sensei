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
 * - `agent_finished`: the agent's turn ended without the report and it did not go on;
 * - `nothing_readable`: the server could not read the text of any material.
 */
export type RunEnding =
  | "stopped"
  | "agent_failed"
  | "interrupted"
  | "agent_not_started"
  | "agent_finished"
  | "nothing_readable";

const endings: Readonly<Record<RunEnding, string>> = {
  stopped: "Разбор остановлен кандидатом.",
  agent_failed: "Агент разбора упал.",
  interrupted: "Разбор прерван: приложение перезапустилось.",
  agent_not_started: "Агент разбора не запустился.",
  agent_finished: "Агент разбора закончил работу без отчёта.",
  nothing_readable: "Сервер не смог прочитать ни один материал: причина — у каждого материала.",
};

/** Why a recheck ended early: it reads no materials. */
const recheckEndings: Readonly<Record<RunEnding, string>> = {
  stopped: "Перепроверка остановлена кандидатом.",
  agent_failed: "Агент перепроверки упал.",
  interrupted: "Перепроверка прервана: приложение перезапустилось.",
  agent_not_started: "Агент перепроверки не запустился.",
  agent_finished: "Агент перепроверки закончил работу без отчёта.",
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
 * Where the run's Sources go when it ends, by the agent's report or without it: of the Sources
 * still «разбирается», those whose every part the agent read become «готов» (`ready`); the rest
 * go back to the Inbox (`back`). A Source with «ошибка» keeps it; `failed` counts them.
 */
export function settledSources(
  run: InboxRun,
  sources: readonly RunSource[],
): { readonly ready: string[]; readonly back: string[]; readonly failed: number } {
  const own = sources.filter((source) => run.sourceIds.includes(source.id));
  const processing = own.filter((source) => source.status === "processing");
  const ready = processing.filter((source) => readWhole(run, source)).map((source) => source.id);
  const back = processing.map((source) => source.id).filter((source) => !ready.includes(source));
  const failed = own.filter((source) => source.status === "failed").length;
  return { ready, back, failed };
}

/**
 * The summary of the agent's report: its own text, and how many materials went back to the Inbox
 * because the agent did not read every part of them.
 */
export function agentSummary(summary: string, back: number): string {
  return back > 0 ? `${summary} Прочитаны не до конца и вернулись в Inbox: ${back}.` : summary;
}

/**
 * The partial Inbox report of a run the server closes without the agent's report, from what the
 * agent wrote: its Questions and duplicates stay, and the Sources go as settledSources says.
 */
export function partialReport(
  run: InboxRun,
  sources: readonly RunSource[],
  { id, reason, createdAt }: { id: string; reason: RunEnding; createdAt: string },
): { readonly report: InboxReport; readonly ready: string[]; readonly back: string[] } {
  const { ready, back, failed } = settledSources(run, sources);
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
