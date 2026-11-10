// The start of an Inbox processing: only the Candidate's button starts it. The server moves the
// chosen Sources to «разбирается», reads their texts into numbered parts, then starts the agent.
import { randomUUID } from "node:crypto";

import { availableAgent } from "../../../shared/background-work/index.ts";
import { inboxOpening, recheckOpening } from "../domain/inbox-brief.ts";
import type { InboxMode, InboxRun } from "../domain/inbox.ts";
import type { Source } from "../domain/source.ts";
import { boundTranscript } from "../domain/source-text.ts";
import { inBackground } from "./inbox-context.ts";
import type { InboxContext, InboxDependencies } from "./inbox-context.ts";
import { closeRun, watchAgent } from "./inbox-ending.ts";
import { readRun } from "./inbox-reading.ts";
import type { Languages } from "./inbox-reading.ts";

/**
 * - `started`: the Sources are «разбирается»; the server reads them and starts the agent in the
 *   background.
 * - `no_sources`: the Target has no Source in the Inbox, or none was chosen.
 * - `invalid_sources`: a chosen Source is not the Target's or not in the Inbox.
 * - `no_questions`: a recheck of a Target without visible Questions.
 * - `processing_running`: the Target already has a running Inbox processing.
 * - `agent_unavailable`: the Target's agent cannot run now; `reason` says why, when known.
 */
export type StartOutcome =
  | { readonly type: "started"; readonly run: InboxRun }
  | {
      readonly type:
        | "target_not_found"
        | "no_sources"
        | "invalid_sources"
        | "no_questions"
        | "processing_running";
    }
  | { readonly type: "agent_unavailable"; readonly reason: string | null };

type Refusal = Exclude<StartOutcome, { type: "started" }>;

/**
 * The chosen Sources with the transcripts in the Inbox bound to a chosen video: the transcript is
 * the video's text, so it goes with the video. In the order of the Target's materials.
 */
function withBoundTranscripts({
  chosen,
  inInbox,
  all,
}: {
  chosen: readonly Source[];
  inInbox: readonly Source[];
  all: readonly Source[];
}): readonly Source[] {
  const ids = new Set(chosen.map((source) => source.id));
  for (const source of chosen) {
    const transcript = boundTranscript(source, all);
    if (transcript !== undefined) {
      ids.add(transcript.id);
    }
  }
  return inInbox.filter((source) => ids.has(source.id));
}

/** The chosen Sources in the Inbox, all of them without a choice; a refusal otherwise. */
async function chosenSources(
  { repository }: InboxDependencies,
  targetId: string,
  sourceIds: readonly string[] | undefined,
): Promise<readonly Source[] | Refusal> {
  const all = await repository.list(targetId);
  const inInbox = all.filter((source) => source.status === "inbox");
  if (sourceIds === undefined) {
    return inInbox.length === 0 ? { type: "no_sources" } : inInbox;
  }
  if (sourceIds.length === 0) {
    return { type: "no_sources" };
  }
  const wanted = new Set(sourceIds);
  const chosen = inInbox.filter((source) => wanted.has(source.id));
  return chosen.length === wanted.size
    ? withBoundTranscripts({ chosen, inInbox, all })
    : { type: "invalid_sources" };
}

/** Checks the start in the order the Candidate can fix it. */
async function checkStart(
  dependencies: InboxDependencies,
  { targetId, sourceIds }: { targetId: string; sourceIds: readonly string[] | undefined },
): Promise<{ sources: readonly Source[]; agent: string } | Refusal> {
  if ((await dependencies.targets.get(targetId)) === undefined) {
    return { type: "target_not_found" };
  }
  if ((await dependencies.inbox.runningRun(targetId)) !== undefined) {
    return { type: "processing_running" };
  }
  const sources = await chosenSources(dependencies, targetId, sourceIds);
  if ("type" in sources) {
    return sources;
  }
  const agent = await availableAgent(dependencies, targetId);
  return typeof agent === "string" ? { sources, agent } : agent;
}

/** Starts the agent's session; a failed start closes the run with a partial report. */
async function startSession(context: InboxContext, run: InboxRun, agent: string) {
  try {
    return await context.dependencies.sessions.start({
      kind: "inbox-processing",
      agent,
      targetId: run.targetId,
      opening: run.mode === "recheck" ? recheckOpening : inboxOpening,
    });
  } catch (error) {
    await closeRun(context, run, "agent_not_started");
    throw error;
  }
}

/**
 * Starts the agent with the opening message unless the Candidate stopped the run meanwhile; a run
 * stopped during the start stops its agent.
 */
async function startAgent(context: InboxContext, run: InboxRun, agent: string): Promise<void> {
  const { sessions, inbox } = context.dependencies;
  const current = await inbox.runningRun(run.targetId);
  if (current?.id !== run.id) {
    return;
  }
  const session = await startSession(context, run, agent);
  if (await inbox.setRunSession(run.id, session.id)) {
    watchAgent(context, run, session.id);
  } else {
    await sessions.stop(session.id);
  }
}

/**
 * Reads the texts, then starts the agent; without a readable material the run ends with a partial
 * report. A cancelled reading starts nothing: «Остановить разбор» has closed the run, and after the
 * server's close the next start closes it.
 */
async function begin(
  context: InboxContext,
  {
    run,
    sources,
    agent,
    languages,
  }: { run: InboxRun; sources: readonly Source[]; agent: string; languages: Languages },
): Promise<void> {
  const { readable, cancelled } = await readRun(context, { run, sources, languages });
  if (cancelled) {
    return;
  }
  await (readable === 0
    ? closeRun(context, run, "nothing_readable")
    : startAgent(context, run, agent));
}

/** A new running Inbox processing of the Sources; a recheck has none. */
function newRun(
  { clock }: InboxDependencies,
  { targetId, sources, mode }: { targetId: string; sources: readonly Source[]; mode: InboxMode },
): InboxRun {
  return {
    id: randomUUID(),
    targetId,
    sessionId: null,
    mode,
    status: "running",
    sourceIds: sources.map((source) => source.id),
    questionIds: [],
    duplicates: 0,
    readParts: {},
    startedAt: clock.now().toISOString(),
    finishedAt: null,
  };
}

/**
 * Stores the run, moves its Sources to «разбирается» and closes the open proposal, in one
 * transaction, then tells the server that the run started; false when another start of the Target
 * won the race.
 */
async function stored(dependencies: InboxDependencies, run: InboxRun) {
  const { repository, inbox, transaction, onRunStarted } = dependencies;
  const created = await transaction(async (opened) => {
    if ((await inbox.createRun(run, opened)) === "running") {
      return false;
    }
    const change = { ids: run.sourceIds, status: "processing" } as const;
    await repository.setStatus(run.targetId, change, opened);
    await inbox.closeProposal(run.targetId, { status: "started", mode: run.mode }, opened);
    return true;
  });
  if (created) {
    onRunStarted({ targetId: run.targetId, mode: run.mode });
  }
  return created;
}

/** «Запустить разбор»: the chosen Sources and the language chosen for each recording. */
export interface StartRequest {
  readonly targetId: string;
  /** Every Source in the Inbox without a choice. */
  readonly sourceIds?: readonly string[] | undefined;
  /** The language of a video or audio file by Source id; the Target's language without one. */
  readonly languages?: Languages | undefined;
}

/**
 * Starts the Inbox processing of the chosen Sources, or of every Source in the Inbox without a
 * choice. Closes the open proposal: the Candidate answered it.
 */
export async function start(context: InboxContext, request: StartRequest): Promise<StartOutcome> {
  const { dependencies } = context;
  const { targetId, sourceIds } = request;
  const checked = await checkStart(dependencies, { targetId, sourceIds });
  if (!("agent" in checked)) {
    return checked;
  }
  const run = newRun(dependencies, { targetId, sources: checked.sources, mode: "processing" });
  if (!(await stored(dependencies, run))) {
    return { type: "processing_running" };
  }
  inBackground(context, async () =>
    begin(context, {
      run,
      sources: checked.sources,
      agent: checked.agent,
      languages: request.languages ?? {},
    }),
  );
  return { type: "started", run };
}

/** Checks a recheck in the order the Candidate can fix it. */
async function checkRecheck(
  dependencies: InboxDependencies,
  targetId: string,
): Promise<{ agent: string } | Refusal> {
  if ((await dependencies.targets.get(targetId)) === undefined) {
    return { type: "target_not_found" };
  }
  if ((await dependencies.inbox.runningRun(targetId)) !== undefined) {
    return { type: "processing_running" };
  }
  const questions = await dependencies.questions.questions(targetId);
  if (!questions.some((question) => !question.hidden)) {
    return { type: "no_questions" };
  }
  const agent = await availableAgent(dependencies, targetId);
  return typeof agent === "string" ? { agent } : agent;
}

/**
 * Starts the recheck of the Target's bank by the Candidate's button: an Inbox processing in the
 * mode `recheck`, without materials. Closes the open recheck proposal.
 */
export async function startRecheck(context: InboxContext, targetId: string): Promise<StartOutcome> {
  const { dependencies } = context;
  const checked = await checkRecheck(dependencies, targetId);
  if (!("agent" in checked)) {
    return checked;
  }
  const run = newRun(dependencies, { targetId, sources: [], mode: "recheck" });
  if (!(await stored(dependencies, run))) {
    return { type: "processing_running" };
  }
  inBackground(context, async () => startAgent(context, run, checked.agent));
  return { type: "started", run };
}
