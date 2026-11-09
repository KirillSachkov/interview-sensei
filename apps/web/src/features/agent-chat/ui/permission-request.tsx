import type { PermissionEntry } from "@/shared/api";

type PermissionOption = PermissionEntry["options"][number];

/** The Russian names of the ACP option kinds; agents name their options in their own language. */
const kindNames: Readonly<Record<string, string>> = {
  allow_once: "Разрешить один раз",
  allow_always: "Разрешать всегда",
  reject_once: "Запретить",
  reject_always: "Запрещать всегда",
};

/** The option's name for the Candidate: by its kind, or the agent's own name for an unknown kind. */
const optionName = (option: PermissionOption) => kindNames[option.kind] ?? option.name;

function answerText(entry: PermissionEntry): string {
  if (entry.answer === null) {
    return "Запрос закрыт без ответа.";
  }
  if (entry.answer.outcome === "cancelled") {
    return "Запрос отменён: ход агента закончился.";
  }
  const { optionId } = entry.answer;
  const chosen = entry.options.find((option) => option.optionId === optionId);
  return `Ваш ответ: ${chosen === undefined ? optionId : optionName(chosen)}`;
}

/**
 * The agent's request for permission, such as to run a command. While it waits, the Candidate
 * picks one of the agent's options; a button names the option by its kind, and the agent's own
 * name, which may say more, shows as its tooltip.
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
        // The title is the agent's display text and may mislead; the command shows what it runs,
        // whole: a long one wraps and scrolls.
        <div>
          Команда или аргументы агента:{" "}
          <pre className="permission-input nowheel">
            <code>{entry.input}</code>
          </pre>
        </div>
      )}
      {waiting ? (
        <p>
          {entry.options.map((option) => (
            <button
              key={option.optionId}
              type="button"
              title={option.name}
              onClick={() => {
                onAnswer(entry.requestId, option.optionId);
              }}
            >
              {optionName(option)}
            </button>
          ))}
        </p>
      ) : (
        <p>{answerText(entry)}</p>
      )}
    </fieldset>
  );
}
