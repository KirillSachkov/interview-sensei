// The Side threads of Mock interviews as the Candidate's side and their agents' `get_brief` see them:
// opening (side-threads.ts), the Handoff brief (side-thread-brief.ts), «Продолжить»
// (side-thread-continuation.ts), deletion and closing at the archive.
import type { SideThread } from "../domain/side-thread.ts";
import type { ContinuationRequest } from "./agent-choice.ts";
import type { Context } from "./context.ts";
import { sideThreadBrief } from "./side-thread-brief.ts";
import { continueSideThread } from "./side-thread-continuation.ts";
import type { ContinueOutcome } from "./side-thread-continuation.ts";
import { closeTargetSideThreads, deleteSideThread, openSideThread } from "./side-threads.ts";
import type { SideThreadOutcome, SideThreadRequest } from "./side-threads.ts";

/** The Side threads of Mock interviews: the Candidate's side and the `get_brief` of their agents. */
export interface SideThreads {
  /** «Обсудить отдельно»: opens a Side thread with the Mock interview's agent. */
  readonly openSideThread: (id: string, request: SideThreadRequest) => Promise<SideThreadOutcome>;
  /** The Mock interview's Side threads in the order they were opened; undefined for an unknown one. */
  readonly sideThreads: (id: string) => Promise<readonly SideThread[] | undefined>;
  /** The Handoff brief of the Side thread whose AgentSession calls, as JSON. */
  readonly sideThreadBrief: (sessionId: string) => Promise<string>;
  /**
   * «Продолжить»: a new session of the Side thread whose agent is gone continues it, with the
   * Target's agent when the Candidate chose it.
   */
  readonly continueSideThread: (
    id: string,
    threadId: string,
    request: ContinuationRequest,
  ) => Promise<ContinueOutcome>;
  /** The Target goes to the archive: its Side threads close for good; the caller stops their agents. */
  readonly closeTargetSideThreads: (targetId: string) => Promise<void>;
  /**
   * ✕: deletes the Side thread with every AgentSession of its chat and their journals; the hint
   * mark stays.
   */
  readonly deleteSideThread: (id: string, threadId: string) => Promise<"deleted" | "not_found">;
}

export function createSideThreads(context: Context): SideThreads {
  const { repository } = context.dependencies;
  return {
    openSideThread: async (id, request) => openSideThread(context, id, request),
    sideThreads: async (id) =>
      (await repository.get(id)) === undefined ? undefined : repository.sideThreads(id),
    sideThreadBrief: async (sessionId) => sideThreadBrief(context, sessionId),
    continueSideThread: async (id, threadId, request) =>
      continueSideThread(context, { interviewId: id, threadId }, request),
    closeTargetSideThreads: async (targetId) => closeTargetSideThreads(context, targetId),
    deleteSideThread: async (id, threadId) =>
      deleteSideThread(context, { interviewId: id, threadId }),
  };
}
