// «Продолжить» in a Side thread (#85): a new AgentSession continues the thread's session whose
// agent is gone, after a restart, a crash or the end of its Mock interview.
import { sideThreadContinues, sideThreadRole } from "../domain/handoff-brief.ts";
import type { MockInterview } from "../domain/interview.ts";
import type { TargetPlan } from "../domain/ports.ts";
import type { SideThread } from "../domain/side-thread.ts";
import { change, inBackground } from "./context.ts";
import type { Context, InterviewsDependencies } from "./context.ts";
import { agentRefusal } from "./side-thread-origins.ts";
import type { AgentRefusal } from "./side-thread-origins.ts";

/**
 * - `continued`: a new session of the Side thread starts in the background and continues the
 *   earlier one.
 * - `running`: the Side thread's agent still runs: it takes messages as it is.
 * - `agent_unavailable`: the Mock interview's agent cannot run now; see SideThreadOutcome.
 */
export type ContinueOutcome =
  | { readonly type: "continued"; readonly thread: SideThread }
  | { readonly type: "not_found" | "running" }
  | AgentRefusal;

const liveStatuses: ReadonlySet<string> = new Set(["starting", "idle", "working"]);

/** The Side thread with its Mock interview and the Target's plan; undefined for an unknown one. */
async function threadOf(
  { repository, targets }: InterviewsDependencies,
  { interviewId, threadId }: { interviewId: string; threadId: string },
) {
  const interview = await repository.get(interviewId);
  const threads = interview === undefined ? [] : await repository.sideThreads(interviewId);
  const thread = threads.find((entry) => entry.id === threadId);
  const plan = interview === undefined ? undefined : await targets.get(interview.targetId);
  return interview === undefined || thread === undefined || plan === undefined
    ? undefined
    : { interview, thread, plan };
}

type Refusal = Exclude<ContinueOutcome, { type: "continued" }>;

/** The Side thread whose agent is gone, with its Mock interview and plan, or the refusal. */
async function stoppedThread(
  { dependencies }: Context,
  ids: { interviewId: string; threadId: string },
): Promise<{ interview: MockInterview; thread: SideThread; plan: TargetPlan } | Refusal> {
  const found = await threadOf(dependencies, ids);
  if (found === undefined) {
    return { type: "not_found" };
  }
  const view = await dependencies.sessions.view(found.thread.sessionId);
  if (view !== undefined && liveStatuses.has(view.status)) {
    return { type: "running" };
  }
  return (await agentRefusal(dependencies, found.interview.agent)) ?? found;
}

/**
 * «Продолжить» in a Side thread whose agent is gone, after a restart, a crash or the end of its
 * Mock interview (#85): a new session with the Mock interview's agent continues the thread's
 * session, so the chat shows both, and its agent reads the thread's messages in `get_brief`. The
 * hint mark stays as the opening set it.
 */
export async function continueSideThread(
  context: Context,
  ids: { interviewId: string; threadId: string },
): Promise<ContinueOutcome> {
  const { repository, sessions } = context.dependencies;
  // Under the Mock interview's change queue, so two quick «Продолжить» start one session.
  const outcome = await change(context, ids.interviewId, async (): Promise<ContinueOutcome> => {
    const stopped = await stoppedThread(context, ids);
    if ("type" in stopped) {
      return stopped;
    }
    const { interview, thread, plan } = stopped;
    const session = await sessions.start({
      kind: "side-thread",
      agent: interview.agent,
      targetId: interview.targetId,
      roleAddition: sideThreadRole(plan),
      continues: thread.sessionId,
    });
    await repository.continueSideThread(thread.id, session.id);
    return { type: "continued", thread: { ...thread, sessionId: session.id } };
  });
  if (outcome.type === "continued") {
    const { sessionId } = outcome.thread;
    inBackground(context, async () =>
      sessions.queuePrompt(sessionId, sideThreadContinues, { showAgentText: false }),
    );
  }
  return outcome;
}
