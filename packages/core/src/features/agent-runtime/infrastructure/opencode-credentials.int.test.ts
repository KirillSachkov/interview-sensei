// Where the server finds the OpenCode 2.x credentials and how it reads them. A temporary directory stands for
// the Candidate's home, with a made-up OpenCode database; the test never reads the real one.
import { mkdir, mkdtemp, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

import { describe, expect, it, onTestFinished } from "vitest";

import type { Timer } from "../../../shared/time/index.ts";
import { inspectAgentHost } from "./installation.ts";
import { readOpencodeCredentials } from "./opencode-credentials.ts";

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

/** The credentials read from the database, with the warnings the read gave. */
async function readWithWarnings(database: string) {
  const warnings: string[] = [];
  const rows = await readOpencodeCredentials(database, (message) => {
    warnings.push(message);
  });
  return { keys: rows.map(({ integration, value }) => ({ integration, value })), warnings };
}

async function databaseOf(home: string, env: Record<string, string> = {}) {
  const host = await inspectAgentHost({ home, env }, idleTimer)();
  return host.opencodeDatabase;
}

describe("opencode 2.x database", () => {
  it("finds the database in the home's XDG data directory without opening it", async () => {
    const home = await temporaryHome();

    await expect(databaseOf(home)).resolves.toBe(
      path.join(home, ".local", "share", "opencode", "opencode.db"),
    );
  });

  it("finds the database that OPENCODE_DB names in XDG_DATA_HOME", async () => {
    const home = await temporaryHome();
    const dataHome = path.join(home, "xdg-data");

    await expect(
      databaseOf(home, { XDG_DATA_HOME: dataHome, OPENCODE_DB: "work.db" }),
    ).resolves.toBe(path.join(dataHome, "opencode", "work.db"));
    await expect(databaseOf(home, { OPENCODE_DB: ":memory:" })).resolves.toBeNull();
  });
});

describe("opencode 2.x credentials", () => {
  it("reads the credentials without changing the database's directory", async () => {
    const home = await temporaryHome();
    const data = path.join(home, "opencode");
    const database = path.join(data, "opencode.db");
    await placeOpencodeDatabase(database, [
      { integration: "deepseek", value: '{"type":"key","key":"sk-deepseek"}' },
    ]);
    const before = await snapshot(data);

    const read = await readWithWarnings(database);

    expect(read).toStrictEqual({
      keys: [{ integration: "deepseek", value: '{"type":"key","key":"sk-deepseek"}' }],
      warnings: [],
    });
    // A plain read-only SQLite open would leave -shm and -wal files beside the database.
    await expect(snapshot(data)).resolves.toStrictEqual(before);
  });

  it("reads nothing and warns of nothing without a database", async () => {
    const home = await temporaryHome();

    await expect(readWithWarnings(path.join(home, "opencode.db"))).resolves.toStrictEqual({
      keys: [],
      warnings: [],
    });
  });

  it("warns with the path but without the content of a database it cannot read", async () => {
    const home = await temporaryHome();
    const database = path.join(home, "opencode.db");
    await writeFile(database, "sk-secret-content");

    const { keys, warnings } = await readWithWarnings(database);

    expect(keys).toStrictEqual([]);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain(database);
    expect(warnings[0]).not.toContain("sk-secret");
  });
});
