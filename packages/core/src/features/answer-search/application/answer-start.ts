// The start of an answer search by «Найти ответы». One background agent work per Target: while the
// Target's Inbox processing runs, the search waits and begins when that ends.
import { randomUUID } from "node:crypto";

import { availableAgent } from "../../../shared/background-work/index.ts";
import { answerOpening } from "../domain/answer-run.ts";
import type { AnswerRun } from "../domain/answer-run.ts";
import { answerQueue } from "../domain/answer-search.ts";
import type { QueueQuestion } from "../domain/answer-search.ts";
import { inBackground } from "./answer-context.ts";
import type { AnswerContext, AnswerDependencies } from "./answer-context.ts";
import { closeRun, watchAgent } from "./answer-ending.ts";

/**
 * - `started`: the run runs, or waits for the Target's Inbox processing (`run.status`).
 * - `nothing_to_fill`: the queue is empty: every visible Question has a reference answer.
 * - `search_running`: the Target already has an answer search that waits or runs.
 * - `agent_unavailable`: the Target's agent cannot run now; `reason` says why, when known.
 */
export type StartOutcome =
  | { readonly type: "started"; readonly run: AnswerRun }
  | { readonly type: "target_not_found" | "nothing_to_fill" | "search_running" }
  | { readonly type: "agent_unavailable"; readonly reason: string | null };

type Refusal = Exclude<StartOutcome, { type: "started" }>;

/** The Target's Questions in the order of the queue: asked in a mock, weak Topics, the rest. */
export async function queueOf(
  { questions, attempts, progress }: AnswerDependencies,
  targetId: string,
): Promise<{ queue: readonly QueueQuestion[]; bank: readonly QueueQuestion[] }> {
  const bank = await questions.questions(targetId);
  const [asked, plan] = await Promise.all([
    attempts.attempted(
      targetId,
      bank.map((question) => question.id),
    ),
    progress.target(targetId),
  ]);
  const weakTopics = (plan?.topics ?? []).filter((topic) => topic.status !== "confident");
  const queue = answerQueue(bank, {
    asked: new Set(asked),
    weakTopics: new Set(weakTopics.map((topic) => topic.id)),
  });
  return { queue, bank };
}

/** Checks the start in the order the Candidate can fix it. */
async function checkStart(
  dependencies: AnswerDependencies,
  targetId: string,
): Promise<{ queue: readonly QueueQuestion[] } | Refusal> {
  if ((await dependencies.targets.get(targetId)) === undefined) {
    return { type: "target_not_found" };
  }
  if ((await dependencies.repository.activeRun(targetId)) !== undefined) {
    return { type: "search_running" };
  }
  const { queue } = await queueOf(dependencies, targetId);
  if (queue.length === 0) {
    return { type: "nothing_to_fill" };
  }
  const agent = await availableAgent(dependencies, targetId);
  return typeof agent === "string" ? { queue } : agent;
}

/**
 * Starts the agent's session; null when the Target or its agent is gone. A failed start closes the
 * run with a partial report.
 */
async function startSession(context: AnswerContext, run: AnswerRun, total: number) {
  const { dependencies } = context;
  const target = await dependencies.targets.get(run.targetId);
  const agent = await availableAgent(dependencies, run.targetId);
  if (target === undefined || typeof agent !== "string") {
    await closeRun(context, run, "agent_not_started");
    return null;
  }
  try {
    return await dependencies.sessions.start({
      kind: "answer-search",
      agent,
      targetId: run.targetId,
      opening: answerOpening({ name: target.name, language: target.language, total }),
    });
  } catch (error) {
    await closeRun(context, run, "agent_not_started");
    throw error;
  }
}

/** Starts the agent and follows it; a run stopped during the start stops its agent. */
async function startAgent(context: AnswerContext, run: AnswerRun, total: number): Promise<void> {
  const { repository, sessions } = context.dependencies;
  const session = await startSession(context, run, total);
  if (session === null) {
    return;
  }
  if (await repository.setSession(run.id, session.id)) {
    watchAgent(context, run, session.id);
  } else {
    await sessions.stop(session.id);
  }
}

/**
 * Begins the waiting run: takes the queue as it is now, the Questions that the Inbox processing
 * added included, and starts the agent. An empty queue closes the run.
 */
async function begin(context: AnswerContext, run: AnswerRun): Promise<void> {
  const { queue } = await queueOf(context.dependencies, run.targetId);
  const queueIds = queue.slice(0, run.requested).map((question) => question.id);
  if (queueIds.length === 0) {
    await closeRun(context, run, "nothing_left");
    return;
  }
  if (await context.dependencies.repository.begin(run.id, queueIds)) {
    await startAgent(context, { ...run, status: "running", queueIds }, queueIds.length);
  }
}

/** Stores the run; false when another start of the Target won the race. */
async function stored({ repository, transaction }: AnswerDependencies, run: AnswerRun) {
  return transaction(async (opened) => (await repository.createRun(run, opened)) === "created");
}

/**
 * Starts the stored run's agent in the background. A waiting run waits for the Inbox processing,
 * and so does a running one when a processing started after the check: it had no search to take
 * over, so the search waits for its end as one started during it.
 */
function launch(context: AnswerContext, run: AnswerRun): void {
  const { inbox, repository } = context.dependencies;
  inBackground(context, async () => {
    const processing = await inbox.running(run.targetId);
    if (run.status === "running" && !processing) {
      await startAgent(context, run, run.queueIds.length);
      return;
    }
    if (run.status === "running" && !(await repository.wait(run.id))) {
      return;
    }
    // The processing may have ended meanwhile, and its end found no waiting run.
    if (!(await inbox.running(run.targetId))) {
      await begin(context, { ...run, status: "waiting", queueIds: [] });
    }
  });
}

/** A new run: `waiting` without its queue, which it takes when it begins. */
function newRun(
  { clock }: AnswerDependencies,
  {
    targetId,
    count,
    queueIds,
  }: { targetId: string; count: number; queueIds: readonly string[] | null },
): AnswerRun {
  return {
    id: randomUUID(),
    targetId,
    sessionId: null,
    status: queueIds === null ? "waiting" : "running",
    requested: count,
    queueIds: queueIds ?? [],
    handedIds: [],
    saved: [],
    startedAt: clock.now().toISOString(),
    finishedAt: null,
  };
}

/**
 * «Найти ответы»: an answer search of up to `count` Questions of the queue. It waits while the
 * Target's Inbox processing runs; otherwise its agent starts in the background.
 */
export async function start(
  context: AnswerContext,
  { targetId, count }: { targetId: string; count: number },
): Promise<StartOutcome> {
  const { dependencies } = context;
  const checked = await checkStart(dependencies, targetId);
  if (!("queue" in checked)) {
    return checked;
  }
  const waiting = await dependencies.inbox.running(targetId);
  const run = newRun(dependencies, {
    targetId,
    count,
    queueIds: waiting ? null : checked.queue.slice(0, count).map((question) => question.id),
  });
  if (!(await stored(dependencies, run))) {
    return { type: "search_running" };
  }
  launch(context, run);
  return { type: "started", run };
}

/**
 * The Target's Inbox processing ended: its waiting answer search begins. Does nothing without one.
 */
export async function beginWaiting(context: AnswerContext, targetId: string): Promise<void> {
  const run = await context.dependencies.repository.activeRun(targetId);
  if (run?.status === "waiting") {
    await begin(context, run);
  }
}
