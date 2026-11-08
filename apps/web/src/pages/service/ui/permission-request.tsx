import type { PermissionEntry } from "@/shared/api";

function answerText(entry: PermissionEntry): string {
  if (entry.answer === null) {
    return "Запрос закрыт без ответа.";
  }
  if (entry.answer.outcome === "cancelled") {
    return "Запрос отменён: ход агента закончился.";
  }
  const { optionId } = entry.answer;
  const chosen = entry.options.find((option) => option.optionId === optionId);
  return `Ваш ответ: ${chosen?.name ?? optionId}`;
}

/**
 * The agent's request for permission, such as to run a command. While it waits, the Candidate
 * picks one of the agent's options; the option names are the agent's own text.
 */
export function PermissionRequest({
  entry,
  canAnswer,
  onAnswer,
}: {
  entry: PermissionEntry;
  /** Whether the agent still waits: the session works and the page follows it. */
  canAnswer: boolean;
  onAnswer: (requestId: string, optionId: string) => void;
}) {
  const waiting = entry.answer === null && canAnswer;
  return (
    <fieldset>
      <legend>Запрос разрешения</legend>
      <p>
        <strong>Агент просит разрешение:</strong> {entry.title ?? "действие без описания"}
      </p>
      {entry.input === null ? null : (
        // The title is the agent's display text and may mislead; the command shows what it runs.
        <p>
          Команда или аргументы агента: <code>{entry.input}</code>
        </p>
      )}
      {waiting ? (
        <p>
          {entry.options.map((option) => (
            <button
              key={option.optionId}
              type="button"
              onClick={() => {
                onAnswer(entry.requestId, option.optionId);
              }}
            >
              {option.name}
            </button>
          ))}
        </p>
      ) : (
        <p>{answerText(entry)}</p>
      )}
    </fieldset>
  );
}
