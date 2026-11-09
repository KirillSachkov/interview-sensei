// Reads the Candidate's OpenCode 2.x credentials for `opencodeKeys` without writing anything
// beside the database: a plain read-only SQLite open would create `-shm` and `-wal` files there.
import { stat } from "node:fs/promises";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { pathToFileURL } from "node:url";

import type { OpencodeCredentialRow } from "../domain/opencode-credentials.ts";

/**
 * The database OpenCode 2.x keeps in `opencode` of the XDG data directory: `opencode.db`, or
 * the file `OPENCODE_DB` names relative to it. Null for OpenCode's in-memory database.
 */
export function opencodeDatabasePath(
  opencodeData: string,
  env: Readonly<Record<string, string | undefined>>,
): string | null {
  const name = env.OPENCODE_DB ?? "opencode.db";
  return name === ":memory:" ? null : path.resolve(opencodeData, name);
}

/** The row with the columns OpenCode 2.2.6 writes, or null for another shape. */
function credentialRow(row: Record<string, unknown>): OpencodeCredentialRow | null {
  const { id, integration, value, active, created } = row;
  return typeof id === "string" &&
    (typeof integration === "string" || integration === null) &&
    typeof value === "string" &&
    (typeof active === "number" || active === null) &&
    typeof created === "number"
    ? { id, integration, value, active, created }
    : null;
}

/** The SQLite error's own message: it names the failure, never the database's content. */
function reason(error: unknown): string {
  return error instanceof Error ? error.message : "unknown error";
}

/** The rows of the `credential` table; throws when SQLite cannot read them. */
function credentialRows(database: string): OpencodeCredentialRow[] {
  const url = pathToFileURL(database);
  // `immutable` takes no lock and reads only the database file, so it leaves no -shm or -wal.
  url.searchParams.set("immutable", "1");
  const connection = new DatabaseSync(url, { readOnly: true });
  try {
    return connection
      .prepare(
        "SELECT id, integration_id AS integration, value, active, time_created AS created FROM credential",
      )
      .all()
      .flatMap((row) => {
        const credential = credentialRow(row);
        return credential === null ? [] : [credential];
      });
  } finally {
    connection.close();
  }
}

async function exists(file: string): Promise<boolean> {
  try {
    await stat(file);
    return true;
  } catch {
    return false;
  }
}

/**
 * The rows of the `credential` table; none without the database. A database it cannot read gives
 * none and a warning with its path and SQLite's reason, never its content. A key that OpenCode
 * still holds in its write-ahead log appears after OpenCode checkpoints it.
 */
export async function readOpencodeCredentials(
  database: string,
  onWarning: (message: string) => void,
): Promise<OpencodeCredentialRow[]> {
  if (!(await exists(database))) {
    return [];
  }
  try {
    return credentialRows(database);
  } catch (error) {
    onWarning(
      `OpenCode 2.x provider keys are unavailable: cannot read ${database} (${reason(error)})`,
    );
    return [];
  }
}
