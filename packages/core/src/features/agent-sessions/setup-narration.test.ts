// Issue #88: OpenCode narrates in English, such as «I'll load the setup skill…», before its first
// tool call in a turn that the server's prompt starts, although its role asks for Russian. In a
// Target setup session the chat leaves out the agent's text of such a turn before its first tool
// call; the text after it, and every text of the Candidate's turns, stays.
import { describe, expect, it } from "vitest";

import type { AgentSession } from "./domain/agent-session.ts";
import type { SessionEvent } from "./domain/session-event.ts";
import { replay } from "./domain/session-view.ts";

const setup: AgentSession = {
  id: "session-1",
  kind: "target-setup",
  agent: "opencode",
  targetId: "target-1",
  status: "idle",
  createdAt: "2026-11-10T03:04:05.000Z",
};

const chunk = (text: string): SessionEvent => ({
  type: "agent_update",
  update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text } },
});
const toolCall: SessionEvent = {
  type: "agent_update",
  update: { sessionUpdate: "tool_call", toolCallId: "tool-1", title: "get_brief" },
};
const serverPrompt: SessionEvent = { type: "prompt_sent", text: "Start", origin: "server" };
const turnEnded: SessionEvent = { type: "turn_ended", stopReason: "end_turn" };

function textsOf(session: AgentSession, events: readonly SessionEvent[]) {
  const view = replay(
    session,
    events.map((event, index) => ({ id: index + 1, event })),
  );
  return view.entries.map((entry) => ("text" in entry ? entry.text : entry.type));
}

const earlierTurn: SessionEvent[] = [
  { type: "prompt_sent", text: "Привет" },
  chunk("Здравствуйте."),
  turnEnded,
];

describe("the agent's text before its first tool call in a Target setup", () => {
  it("leaves out the text before the first tool call of a turn of the server's prompt", () => {
    expect(
      textsOf(setup, [
        serverPrompt,
        chunk("I'll load the setup skill and get the brief."),
        toolCall,
        chunk("Начнём настройку."),
        toolCall,
        chunk(" На какую позицию вы готовитесь?"),
        turnEnded,
      ]),
    ).toStrictEqual(["Начнём настройку. На какую позицию вы готовитесь?"]);
  });

  it("keeps the text of a turn of the server's prompt without a tool call", () => {
    expect(textsOf(setup, [serverPrompt, chunk("Начнём настройку."), turnEnded])).toStrictEqual([
      "Начнём настройку.",
    ]);
  });

  it("keeps the text before a tool call in the Candidate's turn", () => {
    expect(
      textsOf(setup, [
        { type: "prompt_sent", text: "Добавь Kafka" },
        chunk("Добавлю тему."),
        toolCall,
        turnEnded,
      ]),
    ).toStrictEqual(["Добавь Kafka", "Добавлю тему."]);
  });

  it("keeps the interviewer's text before a tool call in a Mock interview", () => {
    expect(
      textsOf({ ...setup, kind: "mock-interview" }, [
        serverPrompt,
        chunk("Хороший ответ."),
        toolCall,
        turnEnded,
      ]),
    ).toStrictEqual(["Хороший ответ."]);
  });

  it("keeps the narration out of the chat while the turn goes on", () => {
    expect(textsOf(setup, [serverPrompt, chunk("I'll load the setup skill.")])).toStrictEqual([]);
  });

  it("starts a new message after a dropped narration, not the earlier turn's", () => {
    expect(
      textsOf(setup, [...earlierTurn, serverPrompt, chunk("Loading."), toolCall, chunk("Начнём.")]),
    ).toStrictEqual(["Привет", "Здравствуйте.", "Начнём."]);
  });
});
