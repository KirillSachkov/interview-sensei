import type { ChatEntry } from "@/shared/api";

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
        <p>
          <strong>Агент:</strong> {entry.text}
        </p>
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

/** The messages of the chat in order. */
export function ChatEntries({
  entries,
  ...answering
}: { entries: readonly ChatEntry[] } & PermissionAnswering) {
  return (
    <ol aria-label="Сообщения" className="chat-entries">
      {entries.map((entry) => (
        <li key={entry.id}>
          <EntryLine entry={entry} answering={answering} />
        </li>
      ))}
    </ol>
  );
}
