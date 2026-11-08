import { readdir } from "node:fs/promises";
import path from "node:path";

import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { notesV1, notesV2, openForTest, tags, temporaryDirectory } from "./test-support.ts";

describe("data directory", () => {
  it("is created on the first start", async () => {
    const parent = await temporaryDirectory();
    const dataDirectory = path.join(parent, "nested", "data");

    await openForTest(dataDirectory);

    await expect(readdir(dataDirectory)).resolves.toContain("database");
  });

  it("gets the migrations of each slice in the slice's own schema", async () => {
    const storage = await openForTest(await temporaryDirectory(), { migrations: [notesV1, tags] });

    const { rows } = await storage.database.execute<{ schema: string; table: string }>(
      sql`SELECT table_schema AS schema, table_name AS table FROM information_schema.tables
          WHERE table_schema IN ('notes', 'tags') ORDER BY 1, 2`,
    );

    expect(rows).toStrictEqual([
      { schema: "notes", table: "__drizzle_migrations" },
      { schema: "notes", table: "notes" },
      { schema: "tags", table: "__drizzle_migrations" },
      { schema: "tags", table: "tags" },
    ]);
  });

  it("keeps the data after a restart and gets the migrations added since", async () => {
    const dataDirectory = await temporaryDirectory();
    const first = await openForTest(dataDirectory, { migrations: [notesV1] });
    await first.database.execute(sql`INSERT INTO notes.notes (text) VALUES ('goroutines')`);
    await first.close();

    const second = await openForTest(dataDirectory, { migrations: [notesV2] });

    const { rows } = await second.database.execute(sql`SELECT text, author FROM notes.notes`);
    expect(rows).toStrictEqual([{ text: "goroutines", author: "candidate" }]);
  });

  it("holds everything the storage writes", async () => {
    const parent = await temporaryDirectory();
    const storage = await openForTest(path.join(parent, "data"));
    await storage.close();

    await expect(readdir(parent)).resolves.toStrictEqual(["data"]);
  });
});
