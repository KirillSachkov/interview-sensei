// The service chat through the server's HTTP and WebSocket API, with real PGlite and the fake
// ACP agent as a separate process.
import { describe, expect, it } from "vitest";

import {
  agentTexts,
  fakeReply,
  fixedTime,
  isIdle,
  messages,
  readyChat,
  startServer,
  temporaryDirectory,
} from "./chat-test-support.ts";
import type { SessionView } from "./chat-test-support.ts";

const isAnswered = (view: SessionView) => isIdle(view) && agentTexts(view).includes(fakeReply);
const isWaitingForCancel = (view: SessionView) =>
  view.status === "working" && agentTexts(view).length > 0;
const isInterrupted = (view: SessionView) =>
  view.entries.some((entry) => entry.type === "turn_interrupted");
const isFailed = (view: SessionView) => view.status === "failed";
const hasFailedTurn = (view: SessionView) =>
  isIdle(view) && view.entries.some((entry) => entry.type === "turn_failed");

/** Runs a server that answers «Привет» in a new chat, then stops it; returns the session id. */
async function chatAndStop(dataDirectory: string): Promise<string> {
  const { server, stop } = await startServer(dataDirectory);
  const { sessionId, events } = await readyChat(server);
  events.send({ type: "prompt", text: "Привет" });
  await events.waitFor(isAnswered);
  await stop();
  return sessionId;
}

describe("service chat", () => {
  it("lists the fake agent as available", async () => {
    const { server } = await startServer(await temporaryDirectory());

    const response = await server.inject({ method: "GET", url: "/api/agents" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toStrictEqual([{ agent: "fake", available: true }]);
  });

  it("streams the agent's reply to the browser in several chunks", async () => {
    const { server } = await startServer(await temporaryDirectory());
    const { events } = await readyChat(server);

    events.send({ type: "prompt", text: "Привет" });

    const answered = await events.waitFor(isAnswered);
    expect(messages(answered)).toStrictEqual([
      { type: "candidate_message", text: "Привет" },
      { type: "agent_message", text: fakeReply },
    ]);
    const replies = new Set(events.views.flatMap((view) => agentTexts(view)));
    expect(replies.size).toBeGreaterThan(2);
    expect(events.views.map((view) => view.status)).toContain("working");
  });

  it("stops the current turn when the Candidate cancels it", async () => {
    const { server } = await startServer(await temporaryDirectory());
    const { events } = await readyChat(server);
    events.send({ type: "prompt", text: "/wait" });
    await events.waitFor(isWaitingForCancel);

    events.send({ type: "cancel" });

    const stopped = await events.waitFor(isInterrupted);
    expect(stopped.status).toBe("idle");
    expect(stopped.entries.at(-1)).toMatchObject({
      type: "turn_interrupted",
      stopReason: "cancelled",
    });
  });

  it("reports a session error when the agent process crashes", async () => {
    const { server } = await startServer(await temporaryDirectory());
    const { events } = await readyChat(server);

    events.send({ type: "prompt", text: "/crash" });

    const failed = await events.waitFor(isFailed);
    expect(failed.failure).toStrictEqual({ reason: "agent_exited", exitCode: 1, signal: null });
    expect(agentTexts(failed)).toStrictEqual(["Падаю…"]);
  });

  it("reports a failed turn and takes the next prompt when the agent answers with an error", async () => {
    const { server } = await startServer(await temporaryDirectory());
    const { events } = await readyChat(server);

    events.send({ type: "prompt", text: "/fail" });

    const failedTurn = await events.waitFor(hasFailedTurn);
    expect(failedTurn.failure).toBeNull();
    expect(failedTurn.entries.at(-1)).toMatchObject({
      type: "turn_failed",
      message: "Фейковый агент не смог ответить",
    });
    events.send({ type: "prompt", text: "Привет" });
    await events.waitFor(isAnswered);
  });

  it("refuses a prompt while the agent works on the previous one", async () => {
    const { server } = await startServer(await temporaryDirectory());
    const { events } = await readyChat(server);
    events.send({ type: "prompt", text: "/wait" });
    await events.waitFor(isWaitingForCancel);

    events.send({ type: "prompt", text: "Второй" });

    await expect(events.nextReply()).resolves.toStrictEqual({
      type: "prompt_rejected",
      reason: "busy",
    });
    events.send({ type: "cancel" });
    const stopped = await events.waitFor(isInterrupted);
    expect(messages(stopped)).toStrictEqual([
      { type: "candidate_message", text: "/wait" },
      { type: "agent_message", text: "Жду отмены…" },
      { type: "turn_interrupted", text: undefined },
    ]);
  });

  it("answers invalid_command to a message it cannot read and keeps the chat working", async () => {
    const { server } = await startServer(await temporaryDirectory());
    const { events } = await readyChat(server);

    events.sendRaw("not json");
    events.send({ type: "prompt", text: "  " });

    await expect(events.nextReply()).resolves.toStrictEqual({ type: "invalid_command" });
    events.send({ type: "prompt", text: "Привет" });
    await events.waitFor(isAnswered);
  });

  it("returns the chat history after a server restart on the same data directory", async () => {
    const dataDirectory = await temporaryDirectory();
    const sessionId = await chatAndStop(dataDirectory);

    const { server } = await startServer(dataDirectory);

    const list = await server.inject({ method: "GET", url: "/api/sessions" });
    expect(list.json()).toStrictEqual([
      { id: sessionId, kind: "service-chat", agent: "fake", status: "ended", createdAt: fixedTime },
    ]);
    const session = await server.inject({ method: "GET", url: `/api/sessions/${sessionId}` });
    expect(session.json<SessionView>()).toMatchObject({ id: sessionId, status: "ended" });
    expect(messages(session.json<SessionView>())).toStrictEqual([
      { type: "candidate_message", text: "Привет" },
      { type: "agent_message", text: fakeReply },
    ]);
  });

  it("answers 404 for a session that does not exist", async () => {
    const { server } = await startServer(await temporaryDirectory());

    const response = await server.inject({
      method: "GET",
      url: "/api/sessions/00000000-0000-4000-8000-000000000000",
    });

    expect(response.statusCode).toBe(404);
  });
});
