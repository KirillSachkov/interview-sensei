import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

import { PGlite } from "@electric-sql/pglite";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { manualTime, openForTest, temporaryDirectory } from "./test-support.ts";

const fiveMinutes = 5 * 60_000;
const dumpFileName = "database.dump.tar.gz";

/** The notes in the dump of `dataDirectory`, read from a database restored from it. */
async function notesInDump(dataDirectory: string): Promise<unknown[]> {
  const dump = await readFile(path.join(dataDirectory, dumpFileName));
  const restored = await PGlite.create({ loadDataDir: new Blob([dump]) });
  try {
    const { rows } = await restored.query("SELECT text FROM notes.notes ORDER BY id");
    return rows;
  } finally {
    await restored.close();
  }
}

describe("database dumps", () => {
  it("are written on close and restore the data", async () => {
    const dataDirectory = await temporaryDirectory();
    const storage = await openForTest(dataDirectory);
    await storage.database.execute(sql`INSERT INTO notes.notes (text) VALUES ('channels')`);

    await storage.close();

    await expect(notesInDump(dataDirectory)).resolves.toStrictEqual([{ text: "channels" }]);
  });

  it("are not written before five minutes of the injected clock pass", async () => {
    const dataDirectory = await temporaryDirectory();
    const time = manualTime();
    await openForTest(dataDirectory, { time });

    await time.pass(fiveMinutes - 1);

    await expect(readdir(dataDirectory)).resolves.not.toContain(dumpFileName);
  });

  it("are written each time five minutes of the injected clock pass", async () => {
    const dataDirectory = await temporaryDirectory();
    const time = manualTime();
    const storage = await openForTest(dataDirectory, { time });
    await storage.database.execute(sql`INSERT INTO notes.notes (text) VALUES ('mutexes')`);

    await time.pass(fiveMinutes);
    await expect(notesInDump(dataDirectory)).resolves.toStrictEqual([{ text: "mutexes" }]);

    await storage.database.execute(sql`INSERT INTO notes.notes (text) VALUES ('select')`);
    await time.pass(fiveMinutes);
    await expect(notesInDump(dataDirectory)).resolves.toStrictEqual([
      { text: "mutexes" },
      { text: "select" },
    ]);
  });
});
