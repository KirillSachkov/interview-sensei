// Seam 1 of spec #47: the setup agent proposes Inbox processing with a card in the chat, and only
// the Candidate's button starts it.
import { describe, expect, it } from "vitest";

import { startServer, temporaryDirectory } from "./chat-test-support.ts";
import {
  addLink,
  attach,
  inboxOf,
  sourcesOnceRead,
  startProcessing,
  vacancy,
} from "./inbox-test-support.ts";
import { first } from "./model-test-support.ts";
import { api, appliedTarget, callTool, setupChat, toolResult } from "./setup-test-support.ts";
import { sources } from "./source-test-support.ts";

async function activeTarget() {
  const { server } = await startServer(await temporaryDirectory());
  const { target, events: setup } = await appliedTarget(server);
  return { server, target, setup };
}

describe("the proposal of Inbox processing", () => {
  it("propose_inbox_processing shows the card with each material's type, size and assessment, and nothing starts", async () => {
    const { server, target, setup } = await activeTarget();
    const file = await attach(server, { targetId: target.id, name: "vacancy.md", body: vacancy });
    const link = await addLink(setup, { title: "Статья", url: "https://example.com/article" });

    const proposed = await toolResult(setup, "propose_inbox_processing", {
      sources: [
        { id: file.id, assessment: "вакансия — добавит темы" },
        { id: link, assessment: "статья не по теме" },
      ],
    });

    expect(proposed).toMatchObject({ shown: 2 });
    await expect(inboxOf(server, target.id)).resolves.toMatchObject({
      proposal: {
        items: [
          {
            sourceId: file.id,
            type: "file",
            title: "vacancy.md",
            size: Buffer.byteLength(vacancy),
            assessment: "вакансия — добавит темы",
          },
          {
            sourceId: link,
            type: "link",
            title: "Статья",
            size: null,
            assessment: "статья не по теме",
          },
        ],
      },
      run: null,
      latestReport: null,
      unprocessed: 2,
    });
    await expect(sources(server, target.id)).resolves.toMatchObject([
      { status: "inbox" },
      { status: "inbox" },
    ]);
    const sessions = await api(server).get("/api/sessions");
    expect(sessions.json<{ kind: string }[]>().map((session) => session.kind)).not.toContain(
      "inbox-processing",
    );
  });

  it("refuses to propose a material of another Target", async () => {
    const { server, target, setup } = await activeTarget();
    const { target: other } = await setupChat(server);
    const foreign = await attach(server, { targetId: other.id, name: "x.md", body: "x" });

    const reply = await callTool(setup, "propose_inbox_processing", {
      sources: [{ id: foreign.id, assessment: "чужое" }],
    });

    expect(reply).toMatch(/^Ошибка propose_inbox_processing: .*is not a material of this Target/u);
    await expect(inboxOf(server, target.id)).resolves.toMatchObject({ proposal: null });
  });

  it("«Не сейчас» closes the card and keeps the materials in the Inbox", async () => {
    const { server, target, setup } = await activeTarget();
    const file = await attach(server, { targetId: target.id, name: "vacancy.md", body: vacancy });
    await toolResult(setup, "propose_inbox_processing", {
      sources: [{ id: file.id, assessment: "вакансия" }],
    });

    const dismissed = await api(server).post(`/api/targets/${target.id}/inbox/proposal/dismiss`);

    expect(dismissed.statusCode).toBe(204);
    await expect(inboxOf(server, target.id)).resolves.toMatchObject({
      proposal: null,
      run: null,
      unprocessed: 1,
    });
    await expect(sources(server, target.id)).resolves.toMatchObject([{ status: "inbox" }]);
  });
});

describe("the start of Inbox processing", () => {
  it("«Запустить разбор» processes only the ticked materials and closes the card", async () => {
    const { server, target, setup } = await activeTarget();
    const ticked = await attach(server, {
      targetId: target.id,
      name: "vacancy [manual].md",
      body: vacancy,
    });
    const unticked = await attach(server, { targetId: target.id, name: "article.md", body: "x" });
    await toolResult(setup, "propose_inbox_processing", {
      sources: [ticked, unticked].map(({ id }) => ({ id, assessment: "материал" })),
    });

    const started = await startProcessing(server, target.id, [ticked.id]);

    expect(started.statusCode).toBe(202);
    expect(started.json()).toMatchObject({ status: "running", sourceIds: [ticked.id] });
    const listed = await sourcesOnceRead(server, target.id);
    expect(listed.map(({ title, status }) => ({ title, status }))).toStrictEqual([
      { title: "vacancy [manual].md", status: "processing" },
      { title: "article.md", status: "inbox" },
    ]);
    await expect(inboxOf(server, target.id)).resolves.toMatchObject({
      proposal: null,
      unprocessed: 1,
    });
  });

  it("a second start while the processing runs gets 409, and new materials wait for the next one", async () => {
    const { server, target } = await activeTarget();
    await attach(server, { targetId: target.id, name: "vacancy [manual].md", body: vacancy });
    const started = await startProcessing(server, target.id);
    await attach(server, { targetId: target.id, name: "later.md", body: "Каналы" });

    const second = await startProcessing(server, target.id);

    expect(started.statusCode).toBe(202);
    expect(second.statusCode).toBe(409);
    expect(second.json()).toMatchObject({ error: "processing_running" });
    await expect(inboxOf(server, target.id)).resolves.toMatchObject({ unprocessed: 1 });
  });

  it("refuses a start without materials in the Inbox, and one of a material not in it", async () => {
    const { server, target } = await activeTarget();
    const empty = await startProcessing(server, target.id);
    const file = await attach(server, { targetId: target.id, name: "a.md", body: "a" });

    const unknown = await startProcessing(server, target.id, [file.id, crypto.randomUUID()]);

    expect(empty.statusCode).toBe(400);
    expect(empty.json()).toMatchObject({ error: "no_sources" });
    expect(unknown.json()).toMatchObject({ error: "invalid_sources" });
    expect(first(await sources(server, target.id)).status).toBe("inbox");
  });
});
