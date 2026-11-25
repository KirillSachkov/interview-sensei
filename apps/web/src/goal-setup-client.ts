import {
  goalSetup,
  goalSetupCommand,
  goalSetupPath,
  goalSetupTurn,
  goalSetupTurnPath,
} from "@sensei/contracts";

type Setup = ReturnType<typeof goalSetup.parse>;
type Command = ReturnType<typeof goalSetupCommand.parse>;

export async function readGoalSetup(workspaceId: string): Promise<Setup> {
  const response = await fetch(goalSetupPath(workspaceId));
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

  function publish(next: Snapshot) {
    snapshot = next;
    for (const listener of listeners) listener();
  }

  function finish(setup: Setup) {
    rememberPending(storageKey);
    publish({ setup, pending: undefined, waiting: false });
  }

  async function reconcile(command: Command) {
    try {
      const setup = await readGoalSetup(workspaceId);
      if (containsTurn(setup, command)) finish(setup);
      else publish({ setup, pending: command, waiting: false });
    } catch {
      publish({ ...snapshot, waiting: false });
    }
  }

  function reconnect() {
    if (!snapshot.pending || snapshot.waiting) return;
    const command = snapshot.pending;
    publish({ ...snapshot, waiting: true });
    void reconcile(command);
  }

  return {
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      window.addEventListener("online", reconnect);
      return () => {
        listeners.delete(listener);
        if (!listeners.size) window.removeEventListener("online", reconnect);
      };
    },
    snapshot: () => snapshot,
    edit() {
      if (!snapshot.waiting) finish(snapshot.setup);
    },
    async send(message: string) {
      if (snapshot.waiting) return;
      const { setup, pending } = snapshot;
      const revision = setup.draft.revision;
      const command =
        pending?.revision === revision
          ? pending
          : goalSetupCommand.parse({
              turnId: crypto.randomUUID(),
              revision,
              message,
            });
      rememberPending(storageKey, command);
      publish({ setup, pending: command, waiting: true });
      try {
        const response = await fetch(
          goalSetupTurnPath(workspaceId, command.turnId),
          {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              revision: command.revision,
              message: command.message,
            }),
          },
        );
        if (!response.ok) throw new Error("Goal setup turn unavailable");
        const { turnId, message, reply, draft } = goalSetupTurn.parse(
          await response.json(),
        );
        finish({
          draft,
          history: [...setup.history, { turnId, message, reply }],
        });
      } catch {
        await reconcile(command);
      }
    },
  };
}
