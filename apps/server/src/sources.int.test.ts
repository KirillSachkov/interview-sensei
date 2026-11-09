// Spec #45, seam 1, ticket #50: the files of a Target. The Candidate attaches files in the setup
// chat, and the server saves each as a Source in the Target's data directory, up to 100 MB.
import { readdir } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";

import { describe, expect, it } from "vitest";

import { fixedTime, startServer, temporaryDirectory } from "./chat-test-support.ts";
import { fileOf, newTarget, sources, upload } from "./source-test-support.ts";
import type { SourceView } from "./source-test-support.ts";

const megabyte = 1024 * 1024;
const limit = 100 * megabyte;
const tooLargeMessage = "Файл больше 100 МБ. Прикрепите файл до 100 МБ.";

/** Every file under the directory, as paths relative to it. */
async function filesUnder(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { recursive: true, withFileTypes: true }).catch(
    () => [],
  );
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => path.relative(directory, path.join(entry.parentPath, entry.name)));
}

/** A generated body of `total` bytes, made in memory chunk by chunk as it is read. */
function generatedBytes(total: number): Readable {
  const chunk = Buffer.alloc(megabyte, "a");
  function* chunks() {
    for (let left = total; left > 0; left -= chunk.byteLength) {
      yield chunk.subarray(0, Math.min(left, chunk.byteLength));
    }
  }
  return Readable.from(chunks());
}

describe("files of a Target", () => {
  it("saves an attached file in the Target's data directory as a Source in the Inbox", async () => {
    const dataDirectory = await temporaryDirectory();
    const { server } = await startServer(dataDirectory);
    const target = await newTarget(server);

    const response = await upload(server, {
      targetId: target.id,
      name: "Вакансия Go.pdf",
      body: "Go-разработчик, 5 лет опыта",
    });

    expect(response.statusCode).toBe(201);
    const saved = response.json<SourceView>();
    expect(saved).toMatchObject({
      targetId: target.id,
      type: "file",
      title: "Вакансия Go.pdf",
      url: null,
      status: "inbox",
      createdAt: fixedTime,
    });
    await expect(fileOf(dataDirectory, saved)).resolves.toStrictEqual({
      directory: path.join("targets", target.id, "sources"),
      name: "Вакансия Go.pdf",
      text: "Go-разработчик, 5 лет опыта",
    });
    await expect(sources(server, target.id)).resolves.toStrictEqual([saved]);
  });

  it("keeps a file whose name holds a path inside the Target's directory", async () => {
    const dataDirectory = await temporaryDirectory();
    const { server } = await startServer(dataDirectory);
    const target = await newTarget(server);

    const response = await upload(server, {
      targetId: target.id,
      name: "../../../evil\u0000.txt",
      body: "Текст",
    });

    expect(response.statusCode).toBe(201);
    await expect(fileOf(dataDirectory, response.json<SourceView>())).resolves.toStrictEqual({
      directory: path.join("targets", target.id, "sources"),
      name: "evil.txt",
      text: "Текст",
    });
  });

  it("refuses a file that declares more than 100 MB and keeps nothing", async () => {
    const dataDirectory = await temporaryDirectory();
    const { server } = await startServer(dataDirectory);
    const target = await newTarget(server);

    const response = await upload(
      server,
      { targetId: target.id, name: "video.mp4", body: generatedBytes(limit + 1) },
      { "content-length": String(limit + 1) },
    );

    expect(response.statusCode).toBe(413);
    expect(response.json()).toStrictEqual({ error: "file_too_large", message: tooLargeMessage });
    await expect(sources(server, target.id)).resolves.toStrictEqual([]);
    await expect(filesUnder(path.join(dataDirectory, "targets"))).resolves.toStrictEqual([]);
  });

  it("refuses a file that grows past 100 MB while it uploads and keeps nothing of it", async () => {
    const dataDirectory = await temporaryDirectory();
    const { server } = await startServer(dataDirectory);
    const target = await newTarget(server);

    const response = await upload(server, {
      targetId: target.id,
      name: "video.mp4",
      body: generatedBytes(limit + 1),
    });

    expect(response.statusCode).toBe(413);
    expect(response.json()).toStrictEqual({ error: "file_too_large", message: tooLargeMessage });
    await expect(sources(server, target.id)).resolves.toStrictEqual([]);
    await expect(filesUnder(path.join(dataDirectory, "targets"))).resolves.toStrictEqual([]);
  });

  it("refuses a file of an unknown Target", async () => {
    const { server } = await startServer(await temporaryDirectory());

    const response = await upload(server, {
      targetId: crypto.randomUUID(),
      name: "resume.pdf",
      body: "Опыт",
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toStrictEqual({ error: "target_not_found" });
  });
});
