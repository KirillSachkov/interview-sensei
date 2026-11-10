// Deleting an AgentSession for good, such as a Side thread: with the earlier sessions it continues
// (#85), so no session of its chat stays behind.
import { rm } from "node:fs/promises";
import path from "node:path";

import type { SessionRepository } from "../domain/ports.ts";
import type { LiveSession } from "./live-session.ts";
import { stopNow } from "./open-session.ts";
import { chainOf } from "./stored-sessions.ts";

/**
 * Stops the agents at once and deletes the session with the earlier sessions it continues, their
 * journals and their directories.
 */
export async function removeChain(
  {
    live,
    dependencies: { repository, sessionsDirectory },
  }: {
    readonly live: ReadonlyMap<string, LiveSession>;
    readonly dependencies: {
      readonly repository: SessionRepository;
      readonly sessionsDirectory: string;
    };
  },
  sessionId: string,
): Promise<void> {
  const chain = await chainOf(live, repository, sessionId);
  await Promise.all(chain.map(async (id) => stopNow(live, id)));
  for (const id of chain) {
    // oxlint-disable-next-line eslint/no-await-in-loop -- the storage runs one transaction at a time
    await repository.remove(id);
  }
  await Promise.all(
    chain.map(async (id) => rm(path.join(sessionsDirectory, id), { recursive: true, force: true })),
  );
}
