// Unit tests of the session/update reducer. They sit at the slice root: domain-is-pure keeps
// even test imports such as vitest out of domain/.
import { describe, expect, it } from "vitest";

import type { AgentSession, ChatEntry } from "./domain/agent-session.ts";
import type { SessionEvent } from "./domain/session-event.ts";
import { replay } from "./domain/session-view.ts";

const session: AgentSession = {
  id: "session-1",
  kind: "service-chat",
  agent: "fake",
  status: "idle",
  createdAt: "2026-01-02T03:04:05.000Z",
};

function chunk(text: string, messageId?: string): SessionEvent {
  return {
    type: "agent_update",
    update: {
      sessionUpdate: "agent_message_chunk",
      content: { type: "text", text },
      ...(messageId === undefined ? {} : { messageId }),
    },
  };
}

function entryText(entry: ChatEntry): string {
  switch (entry.type) {
    case "turn_interrupted": {
      return entry.stopReason;
    }
    case "turn_failed": {
      return entry.message;
    }
    case "permission_request": {
      return entry.title ?? "";
    }
    case "candidate_message":
    case "agent_message": {
      return entry.text;
    }
    default: {
      return entry satisfies never;
    }
  }
}

function agentTextOf(events: readonly SessionEvent[]) {
  return replay(
    session,
    events.map((event, index) => ({ id: index + 1, event })),
  ).agentText;
}

function entriesOf(events: readonly SessionEvent[]) {
  const journal = events.map((event, index) => ({ id: index + 1, event }));
  return replay(session, journal).entries.map((entry) => ({
    type: entry.type,
    text: entryText(entry),
  }));
}

describe("session view", () => {
  it("joins the chunks of one turn without message ids into one agent message", () => {
    expect(
      entriesOf([
        { type: "prompt_sent", text: "Привет" },
        chunk("Здравствуй, "),
        chunk("кандидат"),
      ]),
    ).toStrictEqual([
      { type: "candidate_message", text: "Привет" },
      { type: "agent_message", text: "Здравствуй, кандидат" },
    ]);
  });

  it("starts a new agent message when the message id changes", () => {
    expect(
      entriesOf([chunk("Один", "m1"), chunk(" и всё", "m1"), chunk("Два", "m2")]),
    ).toStrictEqual([
      { type: "agent_message", text: "Один и всё" },
      { type: "agent_message", text: "Два" },
    ]);
  });

  it("keeps the replies of two turns apart", () => {
    expect(
      entriesOf([
        { type: "prompt_sent", text: "1" },
        chunk("Первый"),
        { type: "turn_ended", stopReason: "end_turn" },
        { type: "prompt_sent", text: "2" },
        chunk("Второй"),
      ]),
    ).toStrictEqual([
      { type: "candidate_message", text: "1" },
      { type: "agent_message", text: "Первый" },
      { type: "candidate_message", text: "2" },
      { type: "agent_message", text: "Второй" },
    ]);
  });

  it("shows a turn that ended early, such as a cancelled one", () => {
    expect(
      entriesOf([
        { type: "prompt_sent", text: "/wait" },
        { type: "turn_ended", stopReason: "cancelled" },
      ]),
    ).toStrictEqual([
      { type: "candidate_message", text: "/wait" },
      { type: "turn_interrupted", text: "cancelled" },
    ]);
  });

  it("ignores tool calls and content other than text", () => {
    expect(
      entriesOf([
        { type: "agent_update", update: { sessionUpdate: "tool_call", toolCallId: "t1" } },
        {
          type: "agent_update",
          update: { sessionUpdate: "agent_message_chunk", content: { type: "image", data: "" } },
        },
      ]),
    ).toStrictEqual([]);
  });

  it("shows the agent's command for a permission request without a title", () => {
    expect(inputOf({ toolCallId: "call-1", rawInput: { command: "rm -rf build" } })).toBe(
      "rm -rf build",
    );
  });

  it("shows the agent's command for a permission request with a title", () => {
    expect(
      inputOf({ toolCallId: "call-1", title: "Read a file", rawInput: { command: "rm -rf ~" } }),
    ).toBe("rm -rf ~");
  });

  it("shows the agent's whole command, however long", () => {
    const command = `psql -c "${"select 1; ".repeat(60)}"`;
    expect(inputOf({ toolCallId: "call-1", rawInput: { command } })).toBe(command);
  });

  it("shows all of the agent's arguments for a request without a title or command", () => {
    const input = inputOf({ toolCallId: "call-1", rawInput: { path: "a".repeat(500) } });
    expect(input).toBe(`{"path":"${"a".repeat(500)}"}`);
  });

  it("shows no input for a permission request without raw input", () => {
    expect(inputOf({ toolCallId: "call-1", title: "touch a.txt" })).toBeNull();
  });
});

/** The input that the chat entry of a permission request with this tool call shows. */
function inputOf(toolCall: { toolCallId: string; [field: string]: unknown }) {
  const [entry] = replay(session, [
    { id: 1, event: { type: "permission_requested", requestId: "r1", toolCall, options: [] } },
  ]).entries;
  return entry?.type === "permission_request" ? entry.input : undefined;
}

describe("session view of the server's prompts", () => {
  it("keeps the server's prompts out of the chat", () => {
    expect(
      entriesOf([
        { type: "prompt_sent", text: "The Candidate answered.", origin: "server" },
        chunk("Спасибо"),
      ]),
    ).toStrictEqual([{ type: "agent_message", text: "Спасибо" }]);
  });

  it("starts a new agent message in each turn, even without a Candidate's line between", () => {
    expect(
      entriesOf([
        { type: "prompt_sent", text: "Start", origin: "server" },
        chunk("Начинаем."),
        { type: "turn_ended", stopReason: "end_turn" },
        { type: "prompt_sent", text: "The Candidate answered.", origin: "server" },
        chunk("Ответ получен."),
      ]),
    ).toStrictEqual([
      { type: "agent_message", text: "Начинаем." },
      { type: "agent_message", text: "Ответ получен." },
    ]);
  });

  it("hides the agent's text after agent_text_hidden across turns until agent_text_shown", () => {
    expect(
      entriesOf([
        { type: "prompt_sent", text: "Начнём", origin: "server" },
        chunk("Первый вопрос.", "m1"),
        { type: "agent_text_hidden" },
        chunk(" Подсказка: ответ — 42.", "m1"),
        { type: "turn_ended", stopReason: "end_turn" },
        { type: "prompt_sent", text: "Что значит этот вопрос?" },
        chunk("Подсказка: вспомните про 42.", "m2"),
        { type: "turn_ended", stopReason: "end_turn" },
        { type: "agent_text_shown" },
        { type: "prompt_sent", text: "The Candidate answered.", origin: "server" },
        chunk("Ответ получен.", "m3"),
      ]),
    ).toStrictEqual([
      { type: "agent_message", text: "Первый вопрос." },
      { type: "candidate_message", text: "Что значит этот вопрос?" },
      { type: "agent_message", text: "Ответ получен." },
    ]);
  });

  it("tells while the agent's text is hidden, and not after the session ends", () => {
    expect(
      agentTextOf([{ type: "agent_text_hidden" }, { type: "turn_ended", stopReason: "end_turn" }]),
    ).toBe("hidden");
    expect(agentTextOf([{ type: "agent_text_hidden" }, { type: "session_ended" }])).toBe("new");
  });
});

describe("session view of a continued session", () => {
  it("starts with the chat of the session it continues and adds its own after it", () => {
    const earlier = replay(session, [
      { id: 1, event: { type: "prompt_sent", text: "Привет" } },
      { id: 2, event: chunk("Ответ до паузы") },
    ]).entries;

    const continued = replay(
      { ...session, id: "session-2", continuesSessionId: "session-1" },
      [
        { id: 7, event: { type: "prompt_sent", text: "Продолжим" } },
        { id: 8, event: chunk("Ответ после паузы") },
      ],
      earlier,
    );

    expect(continued.entries.map((entry) => [entry.id, entryText(entry)])).toStrictEqual([
      ["candidate-1", "Привет"],
      ["agent-2", "Ответ до паузы"],
      ["candidate-7", "Продолжим"],
      ["agent-8", "Ответ после паузы"],
    ]);
  });
});
