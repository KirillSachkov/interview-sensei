import type { ChatEntry } from "@/shared/api";

function interruption(stopReason: string): string {
  return stopReason === "cancelled" ? "Ход остановлен." : `Ход прерван: ${stopReason}.`;
}

function EntryLine({ entry }: { entry: ChatEntry }) {
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
    default: {
      return entry satisfies never;
    }
  }
}

/** The messages of the chat in order. */
export function ChatEntries({ entries }: { entries: readonly ChatEntry[] }) {
  return (
    <ol aria-label="Сообщения" style={{ listStyle: "none", padding: 0 }}>
      {entries.map((entry) => (
        <li key={entry.id}>
          <EntryLine entry={entry} />
        </li>
      ))}
    </ol>
  );
}
