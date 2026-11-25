import {
  goalSetup,
  goalSetupCommand,
  goalSetupPath,
  goalSetupTurn,
  goalSetupTurnPath,
} from "@sensei/contracts";

type Setup = ReturnType<typeof goalSetup.parse>;
type Command = ReturnType<typeof goalSetupCommand.parse>;
const readTimeoutMs = 5_000;
const turnTimeoutMs = 100_000;
const recoveryPollIntervalMs = 1_500;

export async function readGoalSetup(
  workspaceId: string,
  recovery?: AbortSignal,
): Promise<Setup> {
  const deadline = AbortSignal.timeout(readTimeoutMs);
  const response = await fetch(goalSetupPath(workspaceId), {
    signal: recovery ? AbortSignal.any([deadline, recovery]) : deadline,
  });
  if (!response.ok) throw new Error("Goal setup unavailable");
  return goalSetup.parse(await response.json());
}

function readPending(key: string): Command | undefined {
  try {
    return goalSetupCommand.safeParse(
      JSON.parse(sessionStorage.getItem(key) ?? "null"),
    ).data;
  } catch {
    return undefined;
  }
}

function rememberPending(key: string, command?: Command) {
  try {
    if (command) sessionStorage.setItem(key, JSON.stringify(command));
    else sessionStorage.removeItem(key);
  } catch {
    return;
  }
}

function containsTurn(setup: Setup, command: Command) {
  return setup.history.some(({ turnId }) => turnId === command.turnId);
}

export function goalSetupClient(workspaceId: string, initial: Setup) {
  const storageKey = `sensei:goal-setup:${workspaceId}`;
  let pending = readPending(storageKey);
  if (pending && containsTurn(initial, pending)) {
    rememberPending(storageKey);
    pending = undefined;
  }

  interface Snapshot {
    setup: Setup;
    pending: Command | undefined;
    waiting: boolean;
  }
  let snapshot: Snapshot = { setup: initial, pending, waiting: false };
  const listeners = new Set<() => void>();
  let recovery: AbortController | undefined;

  function publish(next: Snapshot) {
    snapshot = next;
    for (const listener of listeners) listener();
  }

  function finish(setup: Setup) {
    recovery?.abort();
    rememberPending(storageKey);
    publish({ setup, pending: undefined, waiting: false });
  }

  async function reconcile(
    command: Command | undefined,
    pollForSavedTurn: boolean,
  ) {
    recovery?.abort();
    const controller = new AbortController();
    recovery = controller;
    const { signal } = controller;
    const until = Date.now() + turnTimeoutMs;
    try {
      do {
        const readback = await readGoalSetup(workspaceId, signal).catch(
          () => undefined,
        );
        if (signal.aborted) return;
        const setup = readback ?? snapshot.setup;
        if (command && containsTurn(setup, command)) {
          finish(setup);
          return;
        }
        if (
          snapshot.waiting ||
          setup.draft.revision !== snapshot.setup.draft.revision
        )
          publish({ ...snapshot, setup, waiting: false });
        if (
          !pollForSavedTurn ||
          !command ||
          setup.draft.revision !== command.revision ||
          Date.now() >= until
        )
          return;
        await new Promise<void>((resolve) =>
          window.setTimeout(resolve, recoveryPollIntervalMs),
        );
      } while (!signal.aborted);
    } finally {
      if (recovery === controller) recovery = undefined;
    }
  }

  function reconnect() {
    if (snapshot.waiting || (recovery && !recovery.signal.aborted)) return;
    void reconcile(snapshot.pending, true);
  }

  return {
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      if (listeners.size === 1) {
        window.addEventListener("online", reconnect);
        if (snapshot.pending) reconnect();
      }
      return () => {
        listeners.delete(listener);
        if (!listeners.size) {
          window.removeEventListener("online", reconnect);
          recovery?.abort();
        }
      };
    },
    snapshot: () => snapshot,
    edit() {
      if (snapshot.waiting) return;
      rememberPending(storageKey);
      publish({ ...snapshot, pending: undefined });
    },
    async send(message: string) {
      if (snapshot.waiting) return;
      const { setup, pending } = snapshot;
      const revision = setup.draft.revision;
      if (pending && pending.revision !== revision) return;
      const command =
        pending ??
        goalSetupCommand.parse({
          turnId: crypto.randomUUID(),
          revision,
          message,
        });
      recovery?.abort();
      rememberPending(storageKey, command);
      publish({ setup, pending: command, waiting: true });
      try {
        const response = await fetch(
          goalSetupTurnPath(workspaceId, command.turnId),
          {
            method: "PUT",
            signal: AbortSignal.timeout(turnTimeoutMs),
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              revision: command.revision,
              message: command.message,
            }),
          },
        );
        if (!response.ok) {
          await reconcile(command, response.status !== 503);
          return;
        }
        const { turnId, message, reply, draft } = goalSetupTurn.parse(
          await response.json(),
        );
        finish({
          draft,
          history: [...setup.history, { turnId, message, reply }],
        });
      } catch {
        await reconcile(command, true);
      }
    },
  };
}
