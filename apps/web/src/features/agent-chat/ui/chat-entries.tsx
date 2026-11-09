import { useEffect, useRef } from "react";

import type { ChatEntry } from "@/shared/api";
import { AgentMarkdown } from "@/shared/ui/markdown";

import { PermissionRequest } from "./permission-request";

/** How the Candidate answers the agent's permission requests in the chat. */
interface PermissionAnswering {
  /** Whether the agent can still get an answer: the session works and the page follows it. */
  readonly canAnswer: boolean;
  readonly onAnswer: (requestId: string, optionId: string) => void;
}

function interruption(stopReason: string): string {
  return stopReason === "cancelled" ? "Ход остановлен." : `Ход прерван: ${stopReason}.`;
}

function EntryLine({
  entry,
  answering: { canAnswer, onAnswer },
}: {
  entry: ChatEntry;
  answering: PermissionAnswering;
}) {
  switch (entry.type) {
    case "candidate_message": {
      return (
        <p>
          <strong>Вы:</strong> {entry.text}
        </p>
      );
    }
    case "agent_message": {
      return (
        <div className="agent-message">
          <strong>Агент:</strong> <AgentMarkdown text={entry.text} />
        </div>
      );
    }
    case "turn_interrupted": {
      return <p>{interruption(entry.stopReason)}</p>;
    }
    case "turn_failed": {
      return (
        <p role="alert">Агент не смог ответить: {entry.message}. Отправьте сообщение ещё раз.</p>
      );
    }
    case "permission_request": {
      return <PermissionRequest entry={entry} canAnswer={canAnswer} onAnswer={onAnswer} />;
    }
    default: {
      return entry satisfies never;
    }
  }
}

/** A list closer to its bottom than this, in pixels, counts as scrolled to the bottom. */
const bottomSlack = 2;

/**
 * Keeps the list at its bottom when it gets shorter, such as when the draft of changes takes room
 * below it, but only if it was at the bottom: a Candidate who scrolled up stays where they are.
 * It was at the bottom when the distance to the bottom is no more than the height it lost.
 * Returns the cleanup.
 */
function pinToBottom(list: HTMLElement): () => void {
  let lastHeight = list.clientHeight;
  const observer = new ResizeObserver(() => {
    const lost = Math.max(lastHeight - list.clientHeight, 0);
    lastHeight = list.clientHeight;
    if (list.scrollHeight - list.scrollTop - list.clientHeight <= lost + bottomSlack) {
      list.scrollTop = list.scrollHeight;
    }
  });
  observer.observe(list);
  return () => {
    observer.disconnect();
  };
}

/** The messages of the chat in order; a list that scrolls keeps the newest message in sight. */
export function ChatEntries({
  entries,
  ...answering
}: { entries: readonly ChatEntry[] } & PermissionAnswering) {
  const list = useRef<HTMLOListElement>(null);
  // A new message, or the newest one as it grows by chunks.
  const newest = entries.at(-1);
  useEffect(() => {
    if (newest !== undefined && list.current !== null) {
      list.current.scrollTop = list.current.scrollHeight;
    }
  }, [newest]);
  useEffect(() => (list.current === null ? undefined : pinToBottom(list.current)), []);
  return (
    <ol ref={list} aria-label="Сообщения" className="chat-entries">
      {entries.map((entry) => (
        <li key={entry.id}>
          <EntryLine entry={entry} answering={answering} />
        </li>
      ))}
    </ol>
  );
}
