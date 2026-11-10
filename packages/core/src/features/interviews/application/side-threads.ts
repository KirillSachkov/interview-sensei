// Side threads of a Mock interview (#80): «Обсудить отдельно» starts an AgentSession of the kind
// `side-thread` with the Mock interview's agent. The server decides the hint mark under the Mock
// interview's change queue, so an answer sent at the same time sees it or comes first.
import { randomUUID } from "node:crypto";

import { discussedInSideThread } from "../domain/agent-messages.ts";
import type { AskedQuestion, MockInterview } from "../domain/interview.ts";
import type { TargetPlan } from "../domain/ports.ts";
import { sideThreadOpened, sideThreadRole } from "../domain/handoff-brief.ts";
import { givesHint } from "../domain/side-thread.ts";
import type { SideThread, SideThreadOrigin } from "../domain/side-thread.ts";
import { change, inBackground } from "./context.ts";
import type { Context } from "./context.ts";
import { agentRefusal } from "./agent-choice.ts";
import type { AgentRefusal } from "./agent-choice.ts";
import { originPlace } from "./side-thread-origins.ts";
import type { OriginRefusal } from "./side-thread-origins.ts";

/** Where the Candidate opens the Side thread, the selected fragment and the question, if any. */
export interface SideThreadRequest {
  readonly origin: SideThreadOrigin;
  readonly fragment: string | null;
  readonly question: string | null;
}

/**
 * - `opened`: the agent starts in the background; with the Candidate's question it answers it.
 * - `question_not_found`, `message_not_found`, `attempt_not_found`: the Mock interview has no
 *   such origin.
 * - `message_before_question`: the interviewer's message came before the first question.
 * - `agent_unavailable`: the Mock interview's agent cannot run now; `reason` says why, in Russian,
 *   when the runtime knows it.
 */
export type SideThreadOutcome =
  | { readonly type: "opened"; readonly thread: SideThread }
  | { readonly type: "interview_not_found" }
  | OriginRefusal
  | AgentRefusal;

/** What an opening needs once every check passed. */
interface Opening {
  readonly interview: MockInterview;
  readonly plan: TargetPlan;
  readonly question: AskedQuestion;
  readonly fragment: string | null;
  readonly fromDebrief: boolean;
}

async function checkOpening(
  { dependencies }: Context,
  interviewId: string,
  request: SideThreadRequest,
): Promise<Opening | Exclude<SideThreadOutcome, { type: "opened" }>> {
  const { repository, targets } = dependencies;
  const interview = await repository.get(interviewId);
  const plan = interview === undefined ? undefined : await targets.get(interview.targetId);
  if (interview === undefined || plan === undefined) {
    return { type: "interview_not_found" };
  }
  const place = await originPlace(dependencies, interview, request);
  if ("type" in place) {
    return place;
  }
  return (await agentRefusal(dependencies, interview.agent)) ?? { interview, plan, ...place };
}

/**
 * Stores the Side thread and, before the Candidate's answer, the hint mark of its question. A
 * Side thread from the Debrief records that the Candidate opened it.
 */
async function store(
  context: Context,
  { interview, question, fragment, fromDebrief }: Opening,
  { sessionId, request }: { sessionId: string; request: SideThreadRequest },
): Promise<SideThread> {
  const { repository, clock } = context.dependencies;
  return change(context, interview.id, async () => {
    const current = (await repository.get(interview.id)) ?? interview;
    const [asked, attempts] = await Promise.all([
      repository.asked(interview.id),
      repository.attempts(interview.id),
    ]);
    const hinted = givesHint(current, { asked, attempts }, question.id);
    if (hinted) {
      await repository.markHinted(question.id);
    }
    if (fromDebrief) {
      await repository.markDebriefOpened(question.id);
    }
    const thread: SideThread = {
      id: randomUUID(),
      interviewId: interview.id,
      sessionId,
      origin: request.origin,
      askedQuestionId: question.id,
      fragment,
      question: request.question,
      hinted,
      createdAt: clock.now().toISOString(),
      closedAt: null,
    };
    await repository.createSideThread(thread);
    return thread;
  });
}

/**
 * Tells the interviewer of a running Mock interview only that the Side thread exists, at the start
 * of its next prompt, and gives the Side thread's agent the Candidate's question.
 */
function tellAgents(context: Context, { interview, question }: Opening, thread: SideThread) {
  const { sessions } = context.dependencies;
  if (interview.status === "running") {
    sessions.addNote(interview.sessionId, discussedInSideThread(question.position + 1));
  }
  if (thread.question !== null) {
    inBackground(context, async () =>
      sessions.queuePrompt(thread.sessionId, sideThreadOpened, { showAgentText: false }),
    );
  }
}

/** Opens a Side thread at the asked question with the Mock interview's agent. */
export async function openSideThread(
  context: Context,
  interviewId: string,
  request: SideThreadRequest,
): Promise<SideThreadOutcome> {
  const checked = await checkOpening(context, interviewId, request);
  if (!("plan" in checked)) {
    return checked;
  }
  const session = await context.dependencies.sessions.start({
    kind: "side-thread",
    agent: checked.interview.agent,
    targetId: checked.interview.targetId,
    roleAddition: sideThreadRole(checked.plan),
  });
  const thread = await store(context, checked, { sessionId: session.id, request });
  tellAgents(context, checked, thread);
  return { type: "opened", thread };
}

/**
 * Deletes the Side thread for good: its agent stops at once, its AgentSession with the earlier ones
 * it continues and their journals go, and the hint mark of its question stays. `not_found` for a
 * Side thread of another Mock interview.
 */
export async function deleteSideThread(
  context: Context,
  { interviewId, threadId }: { interviewId: string; threadId: string },
): Promise<"deleted" | "not_found"> {
  const { repository, sessions } = context.dependencies;
  const threads = await repository.sideThreads(interviewId);
  const thread = threads.find((entry) => entry.id === threadId);
  if (thread === undefined) {
    return "not_found";
  }
  await change(context, interviewId, async () => {
    await repository.deleteSideThread(thread.id);
  });
  await sessions.remove(thread.sessionId);
  return "deleted";
}

/**
 * Closes the Side threads of a finished Mock interview whose agent waits for a message, for good;
 * a thread whose agent works or starts goes on. A closed thread stays readable and does not go on.
 */
export async function closeIdleSideThreads(
  { dependencies: { repository, sessions, clock } }: Context,
  interviewId: string,
): Promise<void> {
  const threads = await repository.sideThreads(interviewId);
  const views = await Promise.all(threads.map(async ({ sessionId }) => sessions.view(sessionId)));
  const idle = threads.filter((_thread, index) => views[index]?.status === "idle");
  await repository.closeSideThreads(
    idle.map(({ id }) => id),
    clock.now().toISOString(),
  );
  await Promise.all(idle.map(async ({ sessionId }) => sessions.end(sessionId)));
}

/**
 * Closes every Side thread of the Target's Mock interviews for good, as its archive does (#80);
 * the caller stops their agents.
 */
export async function closeTargetSideThreads(
  { dependencies: { repository, clock } }: Context,
  targetId: string,
): Promise<void> {
  await repository.closeTargetSideThreads(targetId, clock.now().toISOString());
}
