import { rm } from "node:fs/promises";
import path from "node:path";

import type { SessionDirectories } from "../domain/ports.ts";

/** The sessions' working directories under `sessionsDirectory`, one per session id. */
export function sessionDirectories(sessionsDirectory: string): SessionDirectories {
  return {
    remove: async (sessionIds) => {
      await Promise.all(
        sessionIds.map(async (id) =>
          rm(path.join(sessionsDirectory, id), { recursive: true, force: true }),
        ),
      );
    },
  };
}
