// Issue #88: a deletion commits the erasure of the Target's rows before it removes its files, so a
// server that stops in between leaves the files. The next start removes them and keeps the files of
// the sessions that still exist.
import { cp } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { startServer, temporaryDirectory } from "./chat-test-support.ts";
import { archivedDemo, demoName, exists, request, targetData } from "./deletion-test-support.ts";

/** Copies the directories aside and returns how to put them back. */
async function keptCopies(directories: readonly string[]) {
  const kept = await temporaryDirectory();
  await Promise.all(
    directories.map(async (directory, index) =>
      cp(directory, path.join(kept, String(index)), { recursive: true }),
    ),
  );
  return async () => {
    await Promise.all(
      directories.map(async (directory, index) =>
        cp(path.join(kept, String(index)), directory, { recursive: true }),
      ),
    );
  };
}

/** Starts a service chat, deletes the Target and stops the server; resolves with the chat's id. */
async function chatAndDeletion(dataDirectory: string, targetId: string) {
  const { server, stop } = await startServer(dataDirectory);
  const chat = await request(server, {
    method: "POST",
    url: "/api/sessions",
    payload: { kind: "service-chat", agent: "fake" },
  });
  const deleted = await request(server, {
    method: "DELETE",
    url: `/api/targets/${targetId}`,
    payload: { name: demoName },
  });
  expect(deleted.statusCode).toBe(204);
  await stop();
  return chat.json<{ id: string }>().id;
}

describe("a deletion that the server did not finish", () => {
  it("removes at the next start the files that a deletion stopped before removing", async () => {
    const { dataDirectory, targetId, sessionId } = await archivedDemo();
    const restore = await keptCopies([
      path.join(dataDirectory, "targets", targetId),
      path.join(dataDirectory, "sessions", sessionId),
    ]);
    const chatId = await chatAndDeletion(dataDirectory, targetId);
    // The server stopped after the commit and before it removed the files.
    await restore();

    const restarted = await startServer(dataDirectory);
    await restarted.stop();

    await expect(targetData(dataDirectory, { targetId, sessionId })).resolves.toMatchObject({
      files: false,
      sessionFiles: false,
    });
    await expect(exists(path.join(dataDirectory, "sessions", chatId))).resolves.toBe(true);
  });
});
