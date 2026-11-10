// Helpers of the API tests of an agent's model and reasoning level (#111): what the fake agent
// offers, and a server with the fake agent whose chats report them.
import type { FastifyInstance } from "fastify";

import {
  agentTexts,
  browserHeaders,
  isIdle,
  readyChat,
  startServer,
  temporaryDirectory,
} from "./chat-test-support.ts";
import type { ServerOptions, SessionView } from "./chat-test-support.ts";
import { setupChat } from "./setup-test-support.ts";

/** The models of the fake agent; `fake-small` is its own default and has no levels. */
const models = [
  { value: "fake-small", name: "Фейковая малая" },
  { value: "fake-large", name: "Фейковая большая" },
];

/** The reasoning levels of `fake-large`. */
const levels = [
  { value: "low", name: "Низкий" },
  { value: "high", name: "Высокий" },
];

/** What the fake agent offers on its default model. */
export const smallOptions = { model: { current: "fake-small", values: models }, effort: null };

/** What the fake agent offers on `fake-large` at the level. */
export function largeOptions(level: string) {
  return {
    model: { current: "fake-large", values: models },
    effort: { current: level, values: levels },
  };
}

/** The server's requests as the page sends them. */
function requests(server: FastifyInstance) {
  const headers = browserHeaders(server);
  return {
    get: async (url: string) => server.inject({ url, headers }),
    put: async (url: string, payload: object) =>
      server.inject({ method: "PUT", url, headers, payload }),
  };
}

type Events = Awaited<ReturnType<typeof readyChat>>["events"];

const lastAgentText = (view: SessionView) => agentTexts(view).at(-1) ?? "";
const saysModel = (view: SessionView) => isIdle(view) && lastAgentText(view).startsWith("Модель:");
const isWorking = (view: SessionView) => view.status === "working";
const hasStoppedTurn = (view: SessionView) =>
  isIdle(view) && view.entries.some((entry) => entry.type === "turn_interrupted");

/** The session's options and its talk with the agent, over the server's API and its socket. */
function sessionChat(api: ReturnType<typeof requests>, sessionId: string, events: Events) {
  return {
    sessionId,
    events,
    /** The options in the session's view over HTTP. */
    offered: async () => {
      const response = await api.get(`/api/sessions/${sessionId}`);
      return response.json<SessionView>().options;
    },
    /** What the agent itself says of its model and level: the reply to `/options`. */
    agentSays: async () => {
      events.send({ type: "prompt", text: "/options" });
      return lastAgentText(await events.waitFor(saysModel));
    },
    set: async (change: object) => api.put(`/api/sessions/${sessionId}/options`, change),
    /** Keeps the agent in a turn with `/wait`. */
    startTurn: async () => {
      events.send({ type: "prompt", text: "/wait" });
      await events.waitFor(isWorking);
    },
    /** Stops the turn of `/wait`, so the agent waits for a prompt again. */
    stopTurn: async () => {
      events.send({ type: "cancel" });
      await events.waitFor(hasStoppedTurn);
    },
  };
}

/** A server with the fake agent on a temporary data directory. */
export async function optionsServer(options: ServerOptions = {}) {
  const { server } = await startServer(await temporaryDirectory(), options);
  const api = requests(server);
  return {
    server,
    ...api,
    /** Starts a chat and waits for its agent. */
    chat: async () => {
      const { sessionId, events } = await readyChat(server);
      return sessionChat(api, sessionId, events);
    },
    /** A new draft Target with its setup session, once its agent takes prompts. */
    setup: async () => {
      const { session, events } = await setupChat(server);
      return sessionChat(api, session.id, events);
    },
    storeDefault: async (choice: object, agent = "fake") =>
      api.put(`/api/settings/agent-models/${agent}`, choice),
  };
}
