// Side threads of a Mock interview (#80): «Обсудить отдельно» starts an AgentSession of the kind
// `side-thread` with the Mock interview's agent. The server decides the hint mark under the Mock
// interview's change queue, so an answer sent at the same time sees it or comes first.
import { randomUUID } from "node:crypto";

import { discussedInSideThread } from "../domain/agent-messages.ts";
import type { AskedQuestion, Judgment, MockInterview } from "../domain/interview.ts";
import type { TargetPlan } from "../domain/ports.ts";
import { handoffBrief, sideThreadOpened, sideThreadRole } from "../domain/handoff-brief.ts";
import { givesHint } from "../domain/side-thread.ts";
import type { SideThread, SideThreadOrigin } from "../domain/side-thread.ts";
import { change, inBackground } from "./context.ts";
import type { Context, InterviewsDependencies } from "./context.ts";
import { debrief } from "./records.ts";
import { originPlace } from "./side-thread-origins.ts";
import type { OriginRefusal } from "./side-thread-origins.ts";
import { InterviewToolError, planOf } from "./tool-session.ts";

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
  | { readonly type: "agent_unavailable"; readonly reason: string | null };

/** Why the Mock interview's agent cannot run now, or null when it can. */
async function agentRefusal(
  { agents }: InterviewsDependencies,
  agent: string,
): Promise<Extract<SideThreadOutcome, { type: "agent_unavailable" }> | null> {
  const listed = await agents.listAgents();
  const offered = listed.find((entry) => entry.agent === agent);
  if (offered === undefined) {
    return { type: "agent_unavailable", reason: null };
  }
  return offered.available ? null : { type: "agent_unavailable", reason: offered.reason };
}

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
async function openSideThread(
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

/** The judgment of the question's Attempt with the Grade after the latest Dispute; null without one. */
async function judgmentOf(
  dependencies: InterviewsDependencies,
  question: AskedQuestion,
): Promise<Judgment | null> {
  const attempts = await dependencies.repository.attempts(question.interviewId);
  const attempt = attempts.find((entry) => entry.askedQuestionId === question.id);
  const judged =
    attempt === undefined
      ? undefined
      : await debrief(dependencies, question.interviewId, attempt.id);
  return judged === undefined ? null : { ...judged, grade: judged.dispute?.grade ?? judged.grade };
}

/** The Side thread of the calling session with its Mock interview and asked question. */
async function callingThread({ dependencies: { repository } }: Context, sessionId: string) {
  const thread = await repository.sideThreadBySession(sessionId);
  const interview = thread === undefined ? undefined : await repository.get(thread.interviewId);
  if (thread === undefined || interview === undefined) {
    throw new InterviewToolError("No side thread belongs to this session.");
  }
  const asked = await repository.asked(interview.id);
  const question = asked.find((entry) => entry.id === thread.askedQuestionId);
  if (question === undefined) {
    throw new InterviewToolError("The question of this side thread no longer exists.");
  }
  return { thread, interview, question };
}

/** The Handoff brief of the calling Side thread as JSON, for its `get_brief`. */
async function sideThreadBrief(context: Context, sessionId: string): Promise<string> {
  const { thread, interview, question } = await callingThread(context, sessionId);
  const [plan, judgment] = await Promise.all([
    planOf(context, interview),
    judgmentOf(context.dependencies, question),
  ]);
  return JSON.stringify(handoffBrief(thread, { plan, question, judgment }));
}

/**
 * Deletes the Side thread for good: its agent stops at once, its AgentSession and journal go, and
 * the hint mark of its question stays. `not_found` for a Side thread of another Mock interview.
 */
async function deleteSideThread(
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
 * Closes the Side threads of a finished Mock interview whose agent waits for a message; a thread
 * whose agent works or starts goes on. A closed thread stays readable.
 */
export async function closeIdleSideThreads(
  { dependencies: { repository, sessions } }: Context,
  interviewId: string,
): Promise<void> {
  const threads = await repository.sideThreads(interviewId);
  await Promise.all(
    threads.map(async ({ sessionId }) => {
      const view = await sessions.view(sessionId);
      if (view?.status === "idle") {
        await sessions.end(sessionId);
      }
    }),
  );
}

/** The Side threads of Mock interviews: the Candidate's side and the `get_brief` of their agents. */
export interface SideThreads {
  /** «Обсудить отдельно»: opens a Side thread with the Mock interview's agent. */
  readonly openSideThread: (id: string, request: SideThreadRequest) => Promise<SideThreadOutcome>;
  /** The Mock interview's Side threads in the order they were opened; undefined for an unknown one. */
  readonly sideThreads: (id: string) => Promise<readonly SideThread[] | undefined>;
  /** The Handoff brief of the Side thread whose AgentSession calls, as JSON. */
  readonly sideThreadBrief: (sessionId: string) => Promise<string>;
  /** ✕: deletes the Side thread with its AgentSession and journal; the hint mark stays. */
  readonly deleteSideThread: (id: string, threadId: string) => Promise<"deleted" | "not_found">;
}

export function createSideThreads(context: Context): SideThreads {
  const { repository } = context.dependencies;
  return {
    openSideThread: async (id, request) => openSideThread(context, id, request),
    sideThreads: async (id) =>
      (await repository.get(id)) === undefined ? undefined : repository.sideThreads(id),
    sideThreadBrief: async (sessionId) => sideThreadBrief(context, sessionId),
    deleteSideThread: async (id, threadId) =>
      deleteSideThread(context, { interviewId: id, threadId }),
  };
}
