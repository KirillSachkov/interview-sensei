// The OpenCode 2.x provider keys the server finds on a machine. A temporary directory stands for
// the Candidate's home, with a made-up OpenCode database; the test never reads the real one.
import { mkdir, mkdtemp, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

import { describe, expect, it, onTestFinished } from "vitest";

import type { Timer } from "../../../shared/time/index.ts";
import { inspectAgentHost } from "./installation.ts";

/** A timer that never runs a task: these inspections answer before any timeout. */
const idleTimer: Timer = { repeat: () => () => {}, after: () => () => {} };

async function temporaryHome(): Promise<string> {
  const home = await mkdtemp(path.join(tmpdir(), "interview-sensei-home-"));
  onTestFinished(async () => {
    await rm(home, { recursive: true, force: true });
  });
  return home;
}

/**
 * A closed OpenCode 2.x database with the `credential` table of 2.2.6 and the given rows, in WAL
 * mode as OpenCode keeps it.
 */
async function placeOpencodeDatabase(
  file: string,
  rows: readonly { integration: string; value: string }[],
): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  const database = new DatabaseSync(file);
  database.exec(`PRAGMA journal_mode = WAL;
    CREATE TABLE credential (id text PRIMARY KEY, integration_id text, label text NOT NULL,
      value text NOT NULL, connector_id text, method_id text, active integer,
      time_created integer NOT NULL, time_updated integer NOT NULL);`);
  const insert = database.prepare(
    "INSERT INTO credential (id, integration_id, label, value, time_created, time_updated) VALUES (?, ?, 'API key', ?, ?, ?)",
  );
  for (const [index, row] of rows.entries()) {
    insert.run(`cred_${String(index)}`, row.integration, row.value, index, index);
  }
  database.close();
}

/** Each file of the directory with its modification time. */
async function snapshot(directory: string): Promise<Record<string, number>> {
  const names = await readdir(directory);
  const entries = await Promise.all(
    names.map(async (name) => {
      const entry = await stat(path.join(directory, name));
      return [name, entry.mtimeMs] as const;
    }),
  );
  return Object.fromEntries(entries);
}

async function keysIn(home: string, env: Record<string, string> = {}) {
  const host = await inspectAgentHost({ home, env }, idleTimer)();
  return host.opencodeKeys;
}

describe("opencode 2.x provider keys", () => {
  it("reads the API keys from the Candidate's OpenCode database without changing its directory", async () => {
    const home = await temporaryHome();
    const data = path.join(home, ".local", "share", "opencode");
    await placeOpencodeDatabase(path.join(data, "opencode.db"), [
      { integration: "deepseek", value: '{"type":"key","key":"sk-deepseek"}' },
      { integration: "minimax", value: '{"type":"key","key":"sk-minimax"}' },
    ]);
    const before = await snapshot(data);

    const keys = await keysIn(home);

    expect(keys).toStrictEqual([
      { provider: "deepseek", key: "sk-deepseek" },
      { provider: "minimax", key: "sk-minimax" },
    ]);
    // A plain read-only SQLite open would leave -shm and -wal files beside the database.
    await expect(snapshot(data)).resolves.toStrictEqual(before);
  });

  it("reads the database that OPENCODE_DB names in XDG_DATA_HOME", async () => {
    const home = await temporaryHome();
    const dataHome = path.join(home, "xdg-data");
    await placeOpencodeDatabase(path.join(dataHome, "opencode", "work.db"), [
      { integration: "deepseek", value: '{"type":"key","key":"sk-work"}' },
    ]);

    const keys = await keysIn(home, { XDG_DATA_HOME: dataHome, OPENCODE_DB: "work.db" });

    expect(keys).toStrictEqual([{ provider: "deepseek", key: "sk-work" }]);
  });

  it("finds no keys without a database or in a file that is not one", async () => {
    const home = await temporaryHome();
    const missing = await keysIn(home);

    const file = path.join(home, ".local", "share", "opencode", "opencode.db");
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, "{}");
    const broken = await keysIn(home);

    expect({ missing, broken }).toStrictEqual({ missing: [], broken: [] });
  });
});
