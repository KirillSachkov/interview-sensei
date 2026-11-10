// The agent's narration in a Target setup: its text before the first tool call of a turn that the
// server's prompt started, such as OpenCode's English «I'll load the setup skill…» although its
// role asks for Russian (#88). The chat leaves it out; the text after the tool call stays.
import type { ChatEntry, SessionView } from "./agent-session.ts";
import type { SessionEvent } from "./session-event.ts";

/** The entries without the agent's messages from `from` on: its narration before a tool call. */
export function withoutNarration(
  entries: readonly ChatEntry[],
  from: number,
): readonly ChatEntry[] {
  return [
    ...entries.slice(0, from),
    ...entries.slice(from).filter((entry) => entry.type !== "agent_message"),
  ];
}

/** Where the agent's narration starts after the event; see `SessionView.narrationFrom`. */
export function narrationAfter(view: SessionView, event: SessionEvent): number | null {
  switch (event.type) {
    case "prompt_sent": {
      return event.origin === "server" && view.kind === "target-setup" ? view.entries.length : null;
    }
    case "agent_update": {
      return event.update.sessionUpdate === "tool_call" ? null : view.narrationFrom;
    }
    case "turn_ended":
    case "turn_failed":
    case "session_failed":
    case "session_ended": {
      return null;
    }
    case "session_started":
    case "agent_text_hidden":
    case "agent_text_shown":
    case "permission_requested":
    case "permission_answered": {
      return view.narrationFrom;
    }
    default: {
      return event satisfies never;
    }
  }
}
