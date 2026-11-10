// Helpers of the API tests: a server with the fake ACP agent on real PGlite, and the session's
// WebSocket as the browser sees it.
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import type { Clock, Timer } from "@interview-sensei/core/time";
import type { FastifyInstance } from "fastify";
import { expect, onTestFinished } from "vitest";

import type { UserEnvironment } from "./composition.ts";
import { buildServer } from "./server.ts";
import type { ServerDependencies } from "./server.ts";

export const fixedTime = "2026-01-02T03:04:05.000Z";
export const fakeReply = "Фейковый агент получил: «Привет»";

export async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), "interview-sensei-chat-"));
  onTestFinished(async () => {
    await rm(directory, { recursive: true, force: true });
  });
  return directory;
}

export interface ServerOptions {
  readonly host?: string;
  readonly allowedOrigins?: readonly string[];
  readonly skillsDirectory?: string;
  readonly clock?: Clock;
  readonly timer?: Timer;
  /** The stand-ins for speech recognition; see transcription-test-support.ts. */
  readonly transcription?: ServerDependencies["transcription"];
  /** The Candidate's home and env, such as a temporary home whose agent directories must stay untouched. */
  readonly userEnvironment?: UserEnvironment;
}

/**
 * Builds the server with the fake agent on the data directory and listens on a free port of the
 * host, `127.0.0.1` by default: the agent reaches the session's MCP address over real HTTP.
 * `allowedOrigins`, `skillsDirectory` and `userEnvironment` go to buildServer. `stop` closes it early.
 * Without `clock` the time stands at fixedTime; without `timer` no task ever runs.
 */
export async function startServer(
  dataDirectory: string,
  {
    host = "127.0.0.1",
    allowedOrigins = [],
    skillsDirectory,
    clock = { now: () => new Date(fixedTime) },
    // Dumps and agent timeouts are not under test here; the timer never runs a task.
    timer = { repeat: () => () => {}, after: () => () => {} },
    transcription,
    userEnvironment,
  }: ServerOptions = {},
) {
  const server = await buildServer({
    clock,
    timer,
    dataDirectory,
    fakeAgent: true,
    allowedOrigins,
    transcription,
    ...(skillsDirectory === undefined ? {} : { skillsDirectory }),
    ...(userEnvironment === undefined ? {} : { userEnvironment }),
  });
  let closed: Promise<void> | null = null;
  const stop = async () => {
    closed ??= server.close();
    await closed;
  };
  onTestFinished(stop);
  await server.listen({ host, port: 0 });
  return { server, stop };
}

interface Entry {
  readonly id: string;
  readonly type: string;
  readonly text?: string;
  readonly stopReason?: string;
  readonly message?: string;
  readonly requestId?: string;
  readonly title?: string | null;
  readonly input?: string | null;
  readonly options?: readonly { optionId: string; name: string; kind: string }[];
  readonly answer?: { outcome: string; optionId?: string } | null;
}

export interface SessionView {
  readonly id: string;
  readonly status: string;
  readonly entries: readonly Entry[];
  readonly failure: object | null;
  /** `hidden` while the agent's text stays out of the chat. */
  readonly agentText?: string;
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

export function agentTexts(view: SessionView): string[] {
  return view.entries
    .filter((entry) => entry.type === "agent_message")
    .map((entry) => entry.text ?? "");
}

export function messages(view: SessionView) {
  return view.entries.map(({ type, text }) => ({ type, text }));
}

export const isIdle = (view: SessionView) => view.status === "idle";

/**
 * The Host and Origin of the app's own page on the server, as the Candidate's browser sends them.
 * The server refuses other hosts and origins.
 */
export function browserHeaders(server: FastifyInstance): { host: string; origin: string } {
  const [address] = server.addresses();
  if (address === undefined) {
    throw new Error("The server does not listen");
  }
  const host = `${address.family === "IPv6" ? "[::1]" : "127.0.0.1"}:${address.port}`;
  return { host, origin: `http://${host}` };
}

async function startChat(server: FastifyInstance): Promise<string> {
  const response = await server.inject({
    method: "POST",
    url: "/api/sessions",
    headers: browserHeaders(server),
    payload: { kind: "service-chat", agent: "fake" },
  });
  expect(response.statusCode).toBe(201);
  return response.json<{ id: string }>().id;
}

/** Opens the session's event socket; keeps the session views and, apart, the other replies. */
export async function openEvents(server: FastifyInstance, sessionId: string) {
  const views: SessionView[] = [];
  const replies: unknown[] = [];
  let received = Promise.withResolvers<null>();
  const socket = await server.injectWS(
    `/api/sessions/${sessionId}/events`,
    { headers: browserHeaders(server) },
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
export async function readyChat(server: FastifyInstance) {
  const sessionId = await startChat(server);
  const events = await openEvents(server, sessionId);
  await events.waitFor(isIdle);
  return { sessionId, events };
}
