import { useMutation } from "@tanstack/react-query";

import { setSessionOptions } from "@/shared/api";
import type { OptionChoice, SessionView } from "@/shared/api";

function OptionSelect({
  label,
  choice,
  disabled,
  onChange,
}: {
  label: string;
  choice: OptionChoice;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <select
      aria-label={label}
      title={label}
      value={choice.current}
      disabled={disabled}
      onChange={(event) => {
        onChange(event.target.value);
      }}
    >
      {choice.values.map((option) => (
        <option key={option.value} value={option.value}>
          {option.name}
        </option>
      ))}
    </select>
  );
}

/**
 * The model and the reasoning level of the session in the message box. The Candidate changes them
 * while the agent waits for a message; the change holds for this session, and «Настройки» keeps
 * the defaults. Shows nothing until the agent reports what it offers.
 */
export function SessionOptions({ view }: { view: SessionView | null }) {
  const change = useMutation({
    mutationFn: async (choice: { model?: string; effort?: string }) => {
      if (view !== null) {
        await setSessionOptions(view.id, choice);
      }
    },
  });
  const options = view?.options;
  if (
    view === null ||
    options === undefined ||
    (options.model === null && options.effort === null)
  ) {
    return null;
  }
  const disabled = view.status !== "idle" || change.isPending;
  return (
    <span className="session-options">
      {options.model === null ? null : (
        <OptionSelect
          label="Модель"
          choice={options.model}
          disabled={disabled}
          onChange={(model) => {
            change.mutate({ model });
          }}
        />
      )}
      {options.effort === null ? null : (
        <OptionSelect
          label="Уровень мышления"
          choice={options.effort}
          disabled={disabled}
          onChange={(effort) => {
            change.mutate({ effort });
          }}
        />
      )}
      {change.isError ? <span role="alert">Не сменилось: {change.error.message}</span> : null}
    </span>
  );
}
