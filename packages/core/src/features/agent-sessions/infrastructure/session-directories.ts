import { readdir, rm } from "node:fs/promises";
import path from "node:path";

import type { SessionDirectories } from "../domain/ports.ts";

/** A directory name that is an id; any other directory is not a session's. */
const uuidName = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;

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
    list: async () => {
      const entries = await readdir(sessionsDirectory, { withFileTypes: true }).catch(
        (error: unknown) => {
          if (error instanceof Error && "code" in error && error.code === "ENOENT") {
            return [];
          }
          throw error;
        },
      );
      return entries
        .filter((entry) => entry.isDirectory() && uuidName.test(entry.name))
        .map((entry) => entry.name);
    },
  };
}
