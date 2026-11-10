// Spec #83, seam 1, ticket #85: the Target setup session goes on after a restart. Opening the setup
// chat starts a new agent session that continues the earlier one: its chat starts with the earlier
// chat, and its `get_brief` holds the draft of changes and the last messages. After «Завершить»
// the next session starts afresh.
import { describe, expect, it } from "vitest";

import {
  agentTexts,
  isIdle,
  messages,
  openEvents,
  startServer,
  temporaryDirectory,
} from "./chat-test-support.ts";
import type { SessionView } from "./chat-test-support.ts";
import { api, callTool, openSetup, setupChat } from "./setup-test-support.ts";

/** The fake agent's echo of the continuation's first prompt. */
const continuationEcho = "Фейковый агент получил: «Продолжим настройку цели";

/**
 * A draft Target whose setup session got the Candidate's message and recorded a draft change, on a
 * server over the data directory that then stops.
 */
async function setupBeforeRestart(dataDirectory: string) {
  const first = await startServer(dataDirectory);
  const chat = await setupChat(first.server);
  chat.events.send({ type: "prompt", text: "Готовлюсь к Go middle" });
  await chat.events.waitFor(
    (view) =>
      isIdle(view) && agentTexts(view).at(-1) === "Фейковый агент получил: «Готовлюсь к Go middle»",
  );
  await callTool(chat.events, "update_target", { name: "Go-разработчик" });
  const last = chat.events.views.at(-1);
  await first.stop();
  if (last === undefined) {
    throw new Error("The setup chat has no view");
  }
  return { ...chat, last };
}

/** The agent answered the continuation's first prompt. */
const continuationAnswered = (view: SessionView) =>
  isIdle(view) && agentTexts(view).some((text) => text.startsWith(continuationEcho));

/** Opens the setup after a restart, once the agent has answered the continuation's prompt. */
async function reopenedAfterRestart() {
  const dataDirectory = await temporaryDirectory();
  const before = await setupBeforeRestart(dataDirectory);
  const { server } = await startServer(dataDirectory);
  const opened = await api(server).post(`/api/targets/${before.target.id}/setup-session`);
  const session = opened.json<{ id: string; continuesSessionId?: string }>();
  const events = await openEvents(server, session.id);
  const view = await events.waitFor(continuationAnswered);
  return { before, opened, session, events, view };
}

/** The setup chat of a Target ended by «Завершить», opened again after a restart. */
async function reopenedAfterFinish() {
  const dataDirectory = await temporaryDirectory();
  const first = await startServer(dataDirectory);
  const chat = await setupChat(first.server);
  await api(first.server).post(`/api/targets/${chat.target.id}/setup-session/end`);
  await first.stop();
  const { server } = await startServer(dataDirectory);
  const opened = await api(server).post(`/api/targets/${chat.target.id}/setup-session`);
  const { events } = await openSetup(server, chat.target.id);
  return { opened, events };
}

describe("setup session continuation", () => {
  it("continues the setup session after a restart in a new session whose chat starts with the earlier one", async () => {
    const { before, opened, session, view } = await reopenedAfterRestart();

    expect(opened.statusCode).toBe(201);
    expect(session.continuesSessionId).toBe(before.session.id);
    const earlier = messages(before.last);
    expect(messages(view).slice(0, earlier.length)).toStrictEqual(earlier);
  });

  it("gives the continued setup session's agent the draft and the last messages in its brief", async () => {
    const { events } = await reopenedAfterRestart();

    const brief = await callTool(events, "get_brief");

    expect(brief).toContain("The draft of changes, 1 not applied");
    expect(brief).toContain("This session continues an earlier setup session");
    expect(brief).toContain('{"from":"candidate","text":"Готовлюсь к Go middle"}');
  });

  it("starts the setup session afresh after «Завершить», even after a restart", async () => {
    const { opened, events } = await reopenedAfterFinish();

    const brief = await callTool(events, "get_brief");

    expect(opened.statusCode).toBe(201);
    expect(opened.json()).not.toHaveProperty("continuesSessionId");
    expect(brief).not.toContain("This session continues an earlier setup session");
  });
});
