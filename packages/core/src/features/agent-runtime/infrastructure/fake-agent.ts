// The fake ACP agent: tests and manual checks run it instead of a real agent, which needs a
// subscription and the network. Run as `node fake-agent.ts`; it speaks ACP over stdio.
//
// Prompts:
// - `/wait` sends «Жду отмены…» and waits until the client cancels the turn.
// - `/crash` sends «Падаю…» and exits with code 1 in the middle of the turn.
// - `/fail` answers the prompt with a JSON-RPC error and keeps running.
// - Any other text gets the reply «Фейковый агент получил: «<text>»» in several chunks.
//
// The variable INTERVIEW_SENSEI_FAKE_AGENT_MODE stands for broken agents in launcher tests:
// - `silent` never answers and ignores SIGTERM, like a hung agent.
// - `ignore-sigterm` works but ignores SIGTERM, so only SIGKILL stops it.
import { randomUUID } from "node:crypto";
import { Readable, Writable } from "node:stream";
import { setTimeout as delay } from "node:timers/promises";

import { agent, ndJsonStream, PROTOCOL_VERSION, RequestError } from "@agentclientprotocol/sdk";
import type { AgentContext } from "@agentclientprotocol/sdk";

// A short pause between chunks lets a person see the reply grow; the fake agent stands for an
// external program and has no injected Timer.
const chunkPauseMs = 40;

/** Resolves the waiting `/wait` turn of each session when the client cancels it. */
const cancelWaiters = new Map<string, () => void>();

async function sendChunk(client: AgentContext, sessionId: string, text: string): Promise<void> {
  await client.notify("session/update", {
    sessionId,
    update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text } },
  });
}

/** Resolves when everything written to stdout so far has reached the pipe. */
async function flushStdout(): Promise<void> {
  await new Promise<void>((resolve) => {
    process.stdout.write("", () => {
      resolve();
    });
  });
}

/** Sends «Падаю…» and exits with code 1 before the turn ends. */
async function crash(client: AgentContext, sessionId: string): Promise<never> {
  await sendChunk(client, sessionId, "Падаю…");
  await flushStdout();
  process.exit(1);
}

async function waitForCancel(client: AgentContext, sessionId: string) {
  const cancelled = Promise.withResolvers<null>();
  cancelWaiters.set(sessionId, () => {
    cancelled.resolve(null);
  });
  await sendChunk(client, sessionId, "Жду отмены…");
  await cancelled.promise;
  return { stopReason: "cancelled" as const };
}

async function echo(client: AgentContext, sessionId: string, text: string) {
  const reply = `Фейковый агент получил: «${text}»`;
  for (const word of reply.split(/(?<= )/u)) {
    /* oxlint-disable eslint/no-await-in-loop -- chunks go out one after another, like a real stream */
    await sendChunk(client, sessionId, word);
    await delay(chunkPauseMs);
    /* oxlint-enable eslint/no-await-in-loop */
  }
  return { stopReason: "end_turn" as const };
}

const app = agent({ name: "interview-sensei-fake-agent" })
  .onRequest("initialize", () => ({
    protocolVersion: PROTOCOL_VERSION,
    agentCapabilities: {},
    authMethods: [],
  }))
  .onRequest("session/new", () => ({ sessionId: randomUUID() }))
  .onRequest("session/prompt", async ({ params: { sessionId, prompt }, client }) => {
    const text = prompt.map((block) => (block.type === "text" ? block.text : "")).join("");
    if (text === "/crash") {
      return crash(client, sessionId);
    }
    if (text === "/fail") {
      throw new RequestError(-32_603, "Фейковый агент не смог ответить");
    }
    if (text === "/wait") {
      return waitForCancel(client, sessionId);
    }
    return echo(client, sessionId, text);
  })
  .onNotification("session/cancel", ({ params }) => {
    cancelWaiters.get(params.sessionId)?.();
    cancelWaiters.delete(params.sessionId);
  });

const mode = process.env.INTERVIEW_SENSEI_FAKE_AGENT_MODE;
if (mode === "silent" || mode === "ignore-sigterm") {
  process.on("SIGTERM", () => {});
  // Keeps the process alive after its input ends, so only SIGKILL stops it.
  setInterval(() => {}, 60_000);
}
if (mode !== "silent") {
  app.connect(ndJsonStream(Writable.toWeb(process.stdout), Readable.toWeb(process.stdin)));
}
