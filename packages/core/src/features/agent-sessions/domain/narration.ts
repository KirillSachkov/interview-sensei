// The agent's narration in a Target setup: its text before the first tool call of a turn that the
// server's prompt started, such as OpenCode's English «I'll load the setup skill…» although its
// role asks for Russian (#88). The text waits out of the chat: the tool call drops it, and the end
// of a turn without one shows it. The text after the tool call goes to the chat as it comes.
import type { ChatEntry, SessionView } from "./agent-session.ts";
import type { SessionEvent } from "./session-event.ts";

/** Whether the event ends the turn or the session, which shows a waiting narration. */
function ends(event: SessionEvent): boolean {
  return (
    event.type === "turn_ended" ||
    event.type === "turn_failed" ||
    event.type === "session_failed" ||
    event.type === "session_ended"
  );
}

/** The view with its waiting narration in the chat when the event ends the turn without a tool call. */
export function narrationShown(view: SessionView, event: SessionEvent): SessionView {
  return view.narration !== null && ends(event)
    ? { ...view, entries: [...view.entries, ...view.narration], narration: null }
    : view;
}

/** Whether the event is the agent's tool call, which drops a waiting narration. */
export function endsNarration(event: SessionEvent): boolean {
  return event.type === "agent_update" && event.update.sessionUpdate === "tool_call";
}

/** Whether the event's text goes to the waiting narration instead of the chat. */
export function narrates(view: SessionView, event: SessionEvent): boolean {
  return (
    view.narration !== null &&
    event.type === "agent_update" &&
    event.update.sessionUpdate === "agent_message_chunk"
  );
}

/**
 * The narration after the event: a server's prompt in a Target setup starts one, the agent's text
 * grows it through `grow`, and its first tool call or the end of the turn ends it.
 */
export function narrationAfter(
  view: SessionView,
  event: SessionEvent,
  grow: (narration: readonly ChatEntry[]) => readonly ChatEntry[],
): readonly ChatEntry[] | null {
  if (event.type === "prompt_sent") {
    return event.origin === "server" && view.kind === "target-setup" ? [] : null;
  }
  if (view.narration === null || ends(event)) {
    return null;
  }
  if (endsNarration(event)) {
    return null;
  }
  return narrates(view, event) ? grow(view.narration) : view.narration;
}
