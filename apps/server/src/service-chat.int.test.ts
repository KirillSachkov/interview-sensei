// The service chat through the server's HTTP and WebSocket API, with real PGlite and the fake
// ACP agent as a separate process.
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import type { FastifyInstance } from "fastify";
import { describe, expect, it, onTestFinished } from "vitest";

import { buildServer } from "./server.ts";

const fixedTime = "2026-01-02T03:04:05.000Z";
const fakeReply = "Фейковый агент получил: «Привет»";

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), "interview-sensei-chat-"));
  onTestFinished(async () => {
    await rm(directory, { recursive: true, force: true });
  });
  return directory;
}

/** Builds the server with the fake agent on the data directory; `stop` closes it early. */
async function startServer(dataDirectory: string) {
  const server = await buildServer({
    clock: { now: () => new Date(fixedTime) },
    // Periodic dumps are not under test here; the timer never ticks.
    timer: { repeat: () => () => {} },
    dataDirectory,
    fakeAgent: true,
  });
  let closed: Promise<void> | null = null;
  const stop = async () => {
    closed ??= server.close();
    await closed;
  };
  onTestFinished(stop);
  return { server, stop };
}

interface Entry {
  readonly id: string;
  readonly type: string;
  readonly text?: string;
  readonly stopReason?: string;
  readonly message?: string;
}

interface SessionView {
  readonly id: string;
  readonly status: string;
  readonly entries: readonly Entry[];
  readonly failure: object | null;
}

/** The test trusts the server's shape of the view; the assertions check its content. */
function isSessionMessage(message: unknown): message is { type: "session"; session: SessionView } {
  return (
    typeof message === "object" &&
    message !== null &&
    "type" in message &&
    message.type === "session"
  );
}

function agentTexts(view: SessionView): string[] {
  return view.entries
    .filter((entry) => entry.type === "agent_message")
    .map((entry) => entry.text ?? "");
}

function messages(view: SessionView) {
  return view.entries.map(({ type, text }) => ({ type, text }));
}

const isIdle = (view: SessionView) => view.status === "idle";
const isAnswered = (view: SessionView) => isIdle(view) && agentTexts(view).includes(fakeReply);
const isWaitingForCancel = (view: SessionView) =>
  view.status === "working" && agentTexts(view).length > 0;
const isInterrupted = (view: SessionView) =>
  view.entries.some((entry) => entry.type === "turn_interrupted");
const isFailed = (view: SessionView) => view.status === "failed";
const hasFailedTurn = (view: SessionView) =>
  isIdle(view) && view.entries.some((entry) => entry.type === "turn_failed");

async function startChat(server: FastifyInstance): Promise<string> {
  const response = await server.inject({
    method: "POST",
    url: "/api/sessions",
    payload: { kind: "service-chat", agent: "fake" },
  });
  expect(response.statusCode).toBe(201);
  return response.json<{ id: string }>().id;
}

/** Opens the session's event socket; keeps the session views and, apart, the other replies. */
async function openEvents(server: FastifyInstance, sessionId: string) {
  const views: SessionView[] = [];
  const replies: unknown[] = [];
  let received = Promise.withResolvers<null>();
  const socket = await server.injectWS(
    `/api/sessions/${sessionId}/events`,
    {},
    {
      onInit: (ws) => {
        ws.on("message", (data: Buffer) => {
          const message: unknown = JSON.parse(data.toString("utf8"));
          if (isSessionMessage(message)) {
            views.push(message.session);
          } else {
            replies.push(message);
          }
          received.resolve(null);
          received = Promise.withResolvers<null>();
        });
      },
    },
  );
  onTestFinished(() => {
    socket.terminate();
  });
  /** Resolves with the first view, already received or later, that matches. */
  const waitFor = async (matches: (view: SessionView) => boolean): Promise<SessionView> => {
    const found = views.find((view) => matches(view));
    if (found !== undefined) {
      return found;
    }
    await received.promise;
    return waitFor(matches);
  };
  /** Resolves with the first reply other than a session view, already received or later. */
  const nextReply = async (): Promise<unknown> => {
    if (replies.length > 0) {
      return replies[0];
    }
    await received.promise;
    return nextReply();
  };
  const send = (command: object) => {
    socket.send(JSON.stringify(command));
  };
  const sendRaw = (text: string) => {
    socket.send(text);
  };
  return { views, send, sendRaw, waitFor, nextReply };
}

/** Starts a chat and waits until its agent takes prompts. */
async function readyChat(server: FastifyInstance) {
  const sessionId = await startChat(server);
  const events = await openEvents(server, sessionId);
  await events.waitFor(isIdle);
  return { sessionId, events };
}

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
