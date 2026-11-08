// The session/update reducer: folds the journal of an AgentSession into what the browser shows.
// Written for this project; the store of @acp-components/core (MIT) served only as a reference.
import type { AgentSession, ChatEntry, SessionStatus, SessionView } from "./agent-session.ts";
import { isLive } from "./agent-session.ts";
import type { AgentUpdate, RecordedEvent, SessionEvent } from "./session-event.ts";

/** The view of a session before its first journal entry. */
export function emptyView(session: AgentSession): SessionView {
  return { ...session, entries: [], failure: null };
}

/** The status after the event, the same rule for the live session and for the stored one. */
export function statusAfter(status: SessionStatus, event: SessionEvent): SessionStatus {
  switch (event.type) {
    case "session_started":
    case "turn_ended":
    case "turn_failed": {
      return isLive(status) ? "idle" : status;
    }
    case "prompt_sent": {
      return isLive(status) ? "working" : status;
    }
    case "session_failed": {
      return "failed";
    }
    case "session_ended": {
      return isLive(status) ? "ended" : status;
    }
    case "agent_update":
    case "permission_requested":
    case "permission_answered": {
      return status;
    }
    default: {
      return event satisfies never;
    }
  }
}

/** The text of an `agent_message_chunk`, or null for other updates and non-text content. */
function messageChunk(update: AgentUpdate): { text: string; messageId: string | null } | null {
  if (update.sessionUpdate !== "agent_message_chunk") {
    return null;
  }
  const { content, messageId } = update;
  if (
    typeof content !== "object" ||
    content === null ||
    !("type" in content) ||
    content.type !== "text" ||
    !("text" in content) ||
    typeof content.text !== "string"
  ) {
    return null;
  }
  return { text: content.text, messageId: typeof messageId === "string" ? messageId : null };
}

/**
 * Appends a text chunk. A chunk continues the last agent message when the message ids match or
 * both are absent; agents without `messageId` would otherwise turn each chunk into a message.
 */
function withChunk(
  entries: readonly ChatEntry[],
  chunk: { text: string; messageId: string | null },
  id: number,
): readonly ChatEntry[] {
  const last = entries.at(-1);
  if (last?.type === "agent_message" && last.messageId === chunk.messageId) {
    return [...entries.slice(0, -1), { ...last, text: last.text + chunk.text }];
  }
  return [
    ...entries,
    { id: `agent-${id}`, type: "agent_message", text: chunk.text, messageId: chunk.messageId },
  ];
}

/** The longest input a permission entry shows, in characters, with the ellipsis. */
const inputLength = 200;

/**
 * The agent's raw input of the tool call, so the Candidate sees what a request without a title
 * asks: the command when there is one, otherwise the arguments as JSON; shortened to fit.
 */
function rawInputText(toolCall: Readonly<Record<string, unknown>>): string | null {
  const { rawInput } = toolCall;
  if (rawInput === undefined || rawInput === null) {
    return null;
  }
  const command =
    typeof rawInput === "object" && "command" in rawInput ? rawInput.command : undefined;
  const text = typeof command === "string" ? command : JSON.stringify(rawInput);
  return text.length > inputLength ? `${text.slice(0, inputLength - 1)}…` : text;
}

/** The chat entry of a permission request that waits for the Candidate. */
function permissionEntry(
  { requestId, toolCall, options }: Extract<SessionEvent, { type: "permission_requested" }>,
  id: number,
): ChatEntry {
  const title = typeof toolCall.title === "string" ? toolCall.title : null;
  return {
    id: `permission-${id}`,
    type: "permission_request",
    requestId,
    title,
    input: rawInputText(toolCall),
    options,
    answer: null,
  };
}

function withAnswer(
  entries: readonly ChatEntry[],
  { requestId, answer }: Extract<SessionEvent, { type: "permission_answered" }>,
): readonly ChatEntry[] {
  return entries.map((entry) =>
    entry.type === "permission_request" && entry.requestId === requestId
      ? { ...entry, answer }
      : entry,
  );
}

function entriesAfter(
  entries: readonly ChatEntry[],
  { id, event }: RecordedEvent,
): readonly ChatEntry[] {
  switch (event.type) {
    case "prompt_sent": {
      return [...entries, { id: `candidate-${id}`, type: "candidate_message", text: event.text }];
    }
    case "agent_update": {
      const chunk = messageChunk(event.update);
      return chunk === null ? entries : withChunk(entries, chunk, id);
    }
    case "turn_ended": {
      return event.stopReason === "end_turn"
        ? entries
        : [
            ...entries,
            { id: `turn-${id}`, type: "turn_interrupted", stopReason: event.stopReason },
          ];
    }
    case "turn_failed": {
      return [...entries, { id: `turn-${id}`, type: "turn_failed", message: event.message }];
    }
    case "permission_requested": {
      return [...entries, permissionEntry(event, id)];
    }
    case "permission_answered": {
      return withAnswer(entries, event);
    }
    case "session_started":
    case "session_failed":
    case "session_ended": {
      return entries;
    }
    default: {
      return event satisfies never;
    }
  }
}

/** Applies one journal entry to the view. */
export function applyEvent(view: SessionView, recorded: RecordedEvent): SessionView {
  return {
    ...view,
    status: statusAfter(view.status, recorded.event),
    entries: entriesAfter(view.entries, recorded),
    failure: recorded.event.type === "session_failed" ? recorded.event.failure : view.failure,
  };
}

/** Replays a stored journal into the view; `session.status` is the stored status. */
export function replay(session: AgentSession, journal: readonly RecordedEvent[]): SessionView {
  const view = journal.reduce(
    (current, recorded) => applyEvent(current, recorded),
    emptyView({ ...session, status: "starting" }),
  );
  return { ...view, status: session.status };
}
