// The session/update reducer: folds the journal of an AgentSession into what the browser shows.
// Written for this project; the store of @acp-components/core (MIT) served only as a reference.
import type { AgentSession, ChatEntry, SessionStatus, SessionView } from "./agent-session.ts";
import { isLive } from "./agent-session.ts";
import type { AgentUpdate, RecordedEvent } from "./session-event.ts";

/** The view of a session before its first journal entry. */
export function emptyView(session: AgentSession): SessionView {
  return { ...session, entries: [], failure: null };
}

/** The status after the event, the same rule for the live session and for the stored one. */
export function statusAfter(status: SessionStatus, { event }: RecordedEvent): SessionStatus {
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
    case "agent_update": {
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
    status: statusAfter(view.status, recorded),
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
