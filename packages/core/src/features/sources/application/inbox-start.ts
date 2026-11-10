// The start of an Inbox processing: only the Candidate's button starts it. The server moves the
// chosen Sources to «разбирается», reads their texts into numbered parts, then starts the agent.
import { randomUUID } from "node:crypto";

import { UnreadableSourceError } from "../domain/inbox.ts";
import { inboxOpening, recheckOpening } from "../domain/inbox-brief.ts";
import type { InboxMode, InboxRun } from "../domain/inbox.ts";
import type { Source } from "../domain/source.ts";
import { textFormat, textParts } from "../domain/source-text.ts";
import { inBackground } from "./inbox-context.ts";
import type { InboxContext, InboxDependencies } from "./inbox-context.ts";
import { closeRun, watchAgent } from "./inbox-ending.ts";
import { sourceText } from "./inbox-transcription.ts";

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

/** The Target's agent when it can run now; otherwise the refusal. */
async function processingAgent(
  { targets, agents }: InboxDependencies,
  targetId: string,
): Promise<string | Refusal> {
  const targetAgent = await targets.agent(targetId);
  const chosen = targetAgent?.agent ?? null;
  const offered = chosen === null ? [] : await agents.listAgents();
  const availability = offered.find((entry) => entry.agent === chosen);
  if (chosen === null || availability === undefined) {
    return { type: "agent_unavailable", reason: null };
  }
  return availability.available
    ? chosen
    : { type: "agent_unavailable", reason: availability.reason };
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
  return chosen.length === wanted.size ? chosen : { type: "invalid_sources" };
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
  const agent = await processingAgent(dependencies, targetId);
  return typeof agent === "string" ? { sources, agent } : agent;
}

/** Reads the Source's text and stores its numbered parts; rejects when there is no text. */
async function storeParts(context: InboxContext, source: Source): Promise<void> {
  const { repository, texts } = context.dependencies;
  const text = await sourceText(context, source);
  const parts = textParts(text);
  if (parts.length === 0) {
    throw new UnreadableSourceError("в материале нет текста");
  }
  await texts.write(source.targetId, source.id, parts);
  await repository.setParts(source.targetId, source.id, parts.length);
}

/** Gives the Source the server could not read «ошибка» with the reason. */
async function markUnreadable({ dependencies }: InboxContext, source: Source, error: unknown) {
  const failure =
    error instanceof UnreadableSourceError ? error.message : "материал не удалось прочитать";
  const change = { ids: [source.id], status: "failed", failure, from: "processing" } as const;
  await dependencies.repository.setStatus(source.targetId, change);
}

/**
 * Reads the Source's text into parts; a Source the server cannot read gets «ошибка». A web page the
 * server could not read stays «разбирается» without parts: the agent opens it on the web.
 */
async function readText(context: InboxContext, source: Source): Promise<boolean> {
  try {
    await storeParts(context, source);
    return true;
  } catch (error) {
    if (!(error instanceof UnreadableSourceError)) {
      context.dependencies.onError(error);
    }
    if (textFormat(source) === "web") {
      return true;
    }
    await markUnreadable(context, source, error);
    return false;
  }
}

/**
 * Reads the texts one at a time: a large file never waits beside another one in memory. Counts the
 * materials the agent can process.
 */
async function readTexts(context: InboxContext, sources: readonly Source[]): Promise<number> {
  let readable = 0;
  for (const source of sources) {
    // oxlint-disable-next-line eslint/no-await-in-loop -- one large file at a time
    if (await readText(context, source)) {
      readable += 1;
    }
  }
  return readable;
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
 * report.
 */
async function begin(
  context: InboxContext,
  { run, sources, agent }: { run: InboxRun; sources: readonly Source[]; agent: string },
): Promise<void> {
  const readable = await readTexts(context, sources);
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
 * transaction; false when another start of the Target won the race.
 */
async function stored({ repository, inbox, transaction }: InboxDependencies, run: InboxRun) {
  return transaction(async (opened) => {
    if ((await inbox.createRun(run, opened)) === "running") {
      return false;
    }
    const change = { ids: run.sourceIds, status: "processing" } as const;
    await repository.setStatus(run.targetId, change, opened);
    await inbox.closeProposal(run.targetId, { status: "started", mode: run.mode }, opened);
    return true;
  });
}

/**
 * Starts the Inbox processing of the chosen Sources, or of every Source in the Inbox without a
 * choice. Closes the open proposal: the Candidate answered it.
 */
export async function start(
  context: InboxContext,
  request: { targetId: string; sourceIds?: readonly string[] | undefined },
): Promise<StartOutcome> {
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
    begin(context, { run, sources: checked.sources, agent: checked.agent }),
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
  const agent = await processingAgent(dependencies, targetId);
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
