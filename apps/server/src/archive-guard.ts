// An archived Target refuses a new agent session: its setup session and its Mock interview. The
// archive of a Target and the start of its agent session run one after another, so a session never
// starts on a Target that went to the archive meanwhile, and the archive sees the started session.
import type { Features } from "./composition.ts";

type Target = NonNullable<Awaited<ReturnType<Features["targets"]["get"]>>>;

/** Settles after the previous work of the Target; its failure belongs to its own caller. */
async function settled(previous: Promise<unknown>): Promise<void> {
  try {
    await previous;
  } catch {
    // The previous caller got this error.
  }
}

export function archiveGuard(targets: Pick<Features["targets"], "get">) {
  const last = new Map<string, Promise<unknown>>();
  /** Runs the work after the earlier archive or start of the Target has finished. */
  const inTurn = async <Result>(targetId: string, work: () => Promise<Result>) => {
    const previous = last.get(targetId) ?? Promise.resolve();
    const current = (async () => {
      await settled(previous);
      return work();
    })();
    last.set(targetId, current);
    try {
      return await current;
    } finally {
      if (last.get(targetId) === current) {
        last.delete(targetId);
      }
    }
  };
  return {
    /**
     * Starts the Target's agent session with the Target, undefined for an unknown one; resolves
     * with `target_archived` instead for an archived Target.
     */
    startSession: async <Result>(
      targetId: string,
      start: (target: Target | undefined) => Promise<Result>,
    ) =>
      inTurn(targetId, async () => {
        const target = await targets.get(targetId);
        return target?.status === "archived" ? ("target_archived" as const) : start(target);
      }),
    /** Moves the Target to the archive once no start of its agent session is under way. */
    archive: inTurn,
  };
}

export type ArchiveGuard = ReturnType<typeof archiveGuard>;
