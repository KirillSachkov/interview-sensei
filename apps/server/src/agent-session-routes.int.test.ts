// The session WebSocket when AgentSessions fails underneath it: the server must log the
// failure and keep serving, not crash on an unhandled rejection.
import { fastifyWebsocket } from "@fastify/websocket";
import { fastify } from "fastify";
import type { FastifyInstance } from "fastify";
import { describe, expect, it, onTestFinished } from "vitest";

import { registerAgentSessionRoutes } from "./agent-session-routes.ts";
import type { AgentRuntime, AgentSessions, SessionView } from "./composition.ts";

const sessionId = "00000000-0000-4000-8000-000000000000";

const view: SessionView = {
  id: sessionId,
  kind: "service-chat",
  agent: "fake",
  status: "working",
  createdAt: "2026-01-02T03:04:05.000Z",
  entries: [],
  failure: null,
};

/** AgentSessions whose prompt and cancel reject, as when the database or the agent breaks. */
const brokenSessions: AgentSessions = {
  start: () => Promise.resolve(view),
  list: () => Promise.resolve([]),
  view: () => Promise.resolve(view),
  prompt: () => Promise.reject(new Error("prompt broke")),
  cancel: () => Promise.reject(new Error("cancel broke")),
  answerPermission: () => Promise.reject(new Error("not used")),
  subscribe: () => () => {},
  endInterrupted: async () => {},
  close: async () => {},
};

const runtime: AgentRuntime = {
  listAgents: () => Promise.resolve([]),
  start: () => Promise.reject(new Error("not used")),
};

/** Builds a server on the sessions; `failures` resolves with the first two logged errors. */
async function serverWith(sessions: AgentSessions) {
  const logged: string[] = [];
  const failures = Promise.withResolvers<string[]>();
  const server = fastify({ logger: false });
  await server.register(fastifyWebsocket);
  registerAgentSessionRoutes(server, {
    runtime,
    sessions,
    onError: (error) => {
      logged.push(error instanceof Error ? error.message : String(error));
      if (logged.length === 2) {
        failures.resolve(logged);
      }
    },
  });
  onTestFinished(async () => server.close());
  // injectWS waits for the upgrade, which needs a ready server.
  await server.ready();
  return { server, failures: failures.promise };
}

/** Opens the session socket; `invalidCommand` resolves at the first `invalid_command`. */
async function openSocket(server: FastifyInstance) {
  const invalid = Promise.withResolvers<null>();
  const socket = await server.injectWS(
    `/api/sessions/${sessionId}/events`,
    {},
    {
      onInit: (ws) => {
        ws.on("message", (data: Buffer) => {
          if (data.toString("utf8") === '{"type":"invalid_command"}') {
            invalid.resolve(null);
          }
        });
      },
    },
  );
  onTestFinished(() => {
    socket.terminate();
  });
  return { socket, invalidCommand: invalid.promise };
}

describe("session socket", () => {
  it("keeps serving the socket after a prompt and a cancel fail on the server", async () => {
    const { server, failures } = await serverWith(brokenSessions);
    const { socket, invalidCommand } = await openSocket(server);

    socket.send(JSON.stringify({ type: "prompt", text: "Привет" }));
    socket.send(JSON.stringify({ type: "cancel" }));

    // The two commands fail independently, in either order.
    await expect(failures).resolves.toHaveLength(2);
    await expect(failures).resolves.toContain("prompt broke");
    await expect(failures).resolves.toContain("cancel broke");
    socket.send("not json");
    await invalidCommand;
  });
});
