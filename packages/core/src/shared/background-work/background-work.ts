// What the background sessions of a Target share, such as Inbox processing and answer search: the
// check that the Target's agent can run now, work that runs until it settles, and the end of the
// agent's session after its current turn.

/** The Target's agent as the check reads it: null when none is chosen; undefined for no Target. */
interface TargetAgents {
  readonly agent: (targetId: string) => Promise<{ readonly agent: string | null } | undefined>;
}

/** The agents the runtime offers and whether each can run now; `reason` says why not. */
interface OfferedAgents {
  readonly listAgents: () => Promise<
    readonly (
      | { readonly agent: string; readonly available: true }
      | { readonly agent: string; readonly available: false; readonly reason: string }
    )[]
  >;
}

/** The refusal of a start whose agent cannot run; `reason` says why, when known. */
interface AgentUnavailable {
  readonly type: "agent_unavailable";
  readonly reason: string | null;
}

/** The Target's agent when it can run now; otherwise the refusal. */
export async function availableAgent(
  { targets, agents }: { readonly targets: TargetAgents; readonly agents: OfferedAgents },
  targetId: string,
): Promise<string | AgentUnavailable> {
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

/**
 * Runs the work in the background until it settles; `pending` holds it meanwhile, so the server's
 * close can wait for it, and its failure goes to onError.
 */
export function inBackground(
  {
    pending,
    onError,
  }: { readonly pending: Set<Promise<void>>; readonly onError: (error: unknown) => void },
  work: () => Promise<void>,
): void {
  const running = (async () => {
    try {
      await work();
    } catch (error) {
      onError(error);
    }
  })();
  pending.add(running);
  void (async () => {
    await running;
    pending.delete(running);
  })();
}

/**
 * Ends the session after the agent's current turn without waiting for it: a report tool calls it
 * within that turn. A failure goes to onError.
 */
export function endAfterTurn(
  {
    sessions,
    onError,
  }: {
    readonly sessions: { readonly end: (sessionId: string) => Promise<void> };
    readonly onError: (error: unknown) => void;
  },
  sessionId: string,
): void {
  void (async () => {
    try {
      await sessions.end(sessionId);
    } catch (error) {
      onError(error);
    }
  })();
}
