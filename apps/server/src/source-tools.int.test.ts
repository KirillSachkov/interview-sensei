// Spec #45, seam 1, ticket #50: the agent of the Target setup reads and adds the materials of its
// own Target with our MCP tools, and marks an attached file as a vacancy or a resume (#88). The fake agent's `/tool <name> <json>` stands for its calls.
import path from "node:path";

import type { FastifyInstance } from "fastify";
import { describe, expect, it } from "vitest";

import {
  agentTexts,
  browserHeaders,
  fixedTime,
  isIdle,
  openEvents,
  startServer,
  temporaryDirectory,
} from "./chat-test-support.ts";
import type { SessionView } from "./chat-test-support.ts";
import { fileOf, newTarget, sources, upload } from "./source-test-support.ts";
import type { SourceView } from "./source-test-support.ts";

/** The setup session of the Target, once its agent has started the onboarding. */
async function setupChat(server: FastifyInstance, targetId: string) {
  const opened = await server.inject({
    method: "POST",
    url: `/api/targets/${targetId}/setup-session`,
    headers: browserHeaders(server),
  });
  expect(opened.statusCode).toBe(201);
  const events = await openEvents(server, opened.json<{ id: string }>().id);
  await events.waitFor((view) => isIdle(view) && agentTexts(view).length > 0);
  return events;
}

const lastAgentText = (view: SessionView) => agentTexts(view).at(-1) ?? "";

/**
 * Makes the fake agent call our tool with `/tool <name> <json>` and resolves with the tool's text,
 * or with «Ошибка: <text>» when the tool reports an error.
 */
async function callTool(
  events: Awaited<ReturnType<typeof setupChat>>,
  name: string,
  args: object = {},
): Promise<string> {
  const before = agentTexts(
    events.views.at(-1) ?? { id: "", status: "", entries: [], failure: null },
  );
  events.send({ type: "prompt", text: `/tool ${name} ${JSON.stringify(args)}` });
  const answered = await events.waitFor(
    (view) =>
      isIdle(view) &&
      agentTexts(view).length > before.length &&
      /^(?:Результат|Ошибка) /u.test(lastAgentText(view)),
  );
  const reply = lastAgentText(answered);
  return reply.startsWith(`Результат ${name}: `)
    ? reply.slice(`Результат ${name}: `.length)
    : reply.replace(`Ошибка ${name}: `, "Ошибка: ");
}

describe("materials for the agent of the Target setup", () => {
  it("adds the links and notes that the Candidate gave in the text to the Target's materials", async () => {
    const dataDirectory = await temporaryDirectory();
    const { server } = await startServer(dataDirectory);
    const target = await newTarget(server);
    const events = await setupChat(server, target.id);

    await callTool(events, "add_sources", {
      sources: [
        { type: "vacancy", title: "Вакансия на hh.ru", url: "https://hh.ru/vacancy/1" },
        { title: "Рассказ об опыте", text: "Пять лет пишу на Go." },
      ],
    });

    const [vacancy, note] = await sources(server, target.id);
    expect(vacancy).toMatchObject({
      type: "vacancy",
      title: "Вакансия на hh.ru",
      url: "https://hh.ru/vacancy/1",
      path: null,
      status: "inbox",
    });
    expect(note).toMatchObject({
      type: "note",
      title: "Рассказ об опыте",
      url: null,
      status: "inbox",
    });
    await expect(fileOf(dataDirectory, note)).resolves.toMatchObject({
      directory: path.join("targets", target.id, "sources"),
      text: "Пять лет пишу на Go.",
    });
  });

  it("lists the Target's materials and gives the path of an attached file", async () => {
    const { server } = await startServer(await temporaryDirectory());
    const target = await newTarget(server);
    const attached = await upload(server, { targetId: target.id, name: "resume.pdf", body: "CV" });
    const saved = attached.json<SourceView>();
    const events = await setupChat(server, target.id);

    const listed = await callTool(events, "list_sources");
    const read = await callTool(events, "get_source", { id: saved.id });

    expect(JSON.parse(listed)).toStrictEqual([
      {
        id: saved.id,
        type: "file",
        title: "resume.pdf",
        url: null,
        status: "inbox",
        failure: null,
        parts: null,
        progress: null,
        createdAt: fixedTime,
      },
    ]);
    expect(JSON.parse(read)).toStrictEqual({
      id: saved.id,
      type: "file",
      title: "resume.pdf",
      url: null,
      path: saved.path,
      status: "inbox",
      failure: null,
      parts: null,
      progress: null,
      createdAt: fixedTime,
    });
  });

  it("marks an attached file as a resume once the agent has read it", async () => {
    const { server } = await startServer(await temporaryDirectory());
    const target = await newTarget(server);
    const attached = await upload(server, { targetId: target.id, name: "cv.pdf", body: "CV" });
    const events = await setupChat(server, target.id);

    const marked = await callTool(events, "set_source_type", {
      id: attached.json<SourceView>().id,
      type: "resume",
    });

    expect(JSON.parse(marked)).toMatchObject({ title: "cv.pdf", type: "resume" });
    await expect(sources(server, target.id)).resolves.toMatchObject([
      { title: "cv.pdf", type: "resume" },
    ]);
  });

  it("shows the agent only the materials of its own Target", async () => {
    const { server } = await startServer(await temporaryDirectory());
    const own = await newTarget(server);
    const foreign = await newTarget(server);
    const attached = await upload(server, {
      targetId: foreign.id,
      name: "чужое.pdf",
      body: "Чужое",
    });
    const events = await setupChat(server, own.id);

    const listed = await callTool(events, "list_sources");
    const read = await callTool(events, "get_source", { id: attached.json<SourceView>().id });

    const marked = await callTool(events, "set_source_type", {
      id: attached.json<SourceView>().id,
      type: "vacancy",
    });

    expect(JSON.parse(listed)).toStrictEqual([]);
    expect(read).toBe("Ошибка: Source not found");
    expect(marked).toBe("Ошибка: Source not found");
  });
});
