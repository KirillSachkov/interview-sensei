import { useMutation } from "@tanstack/react-query";

import { setSessionOptions } from "@/shared/api";
import type { AgentOptions, OptionChoice, SessionView } from "@/shared/api";

/** The chosen model and level as text, such as «6.1 Sol · Low»; empty before the agent reports. */
export function optionsSummary(options: AgentOptions | undefined): string {
  const names = [options?.model, options?.effort].flatMap((choice) => {
    const current = choice?.values.find((option) => option.value === choice.current);
    return current === undefined ? [] : [current.name];
  });
  return names.join(" · ");
}

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
    <label className="option-pill">
      <span>{label}</span>
      <select
        aria-label={label}
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
    </label>
  );
}

/** What the Candidate changes: the model or the reasoning level. */
export interface OptionChange {
  readonly model?: string;
  readonly effort?: string;
}

/**
 * The model and the reasoning level as two labelled lists in the message box. Shows nothing for
 * an agent that offers neither.
 */
export function OptionPills({
  options,
  disabled,
  onChange,
}: {
  options: AgentOptions;
  disabled: boolean;
  onChange: (change: OptionChange) => void;
}) {
  return (
    <span className="session-options">
      {options.model === null ? null : (
        <OptionSelect
          label="Модель"
          choice={options.model}
          disabled={disabled}
          onChange={(model) => {
            onChange({ model });
          }}
        />
      )}
      {options.effort === null ? null : (
        <OptionSelect
          label="Мышление"
          choice={options.effort}
          disabled={disabled}
          onChange={(effort) => {
            onChange({ effort });
          }}
        />
      )}
    </span>
  );
}

/**
 * The model and the reasoning level of the session in the message box. The Candidate changes them
 * while the agent waits for a message; the change holds for this session, and «Настройки» keeps
 * the defaults. Shows nothing until the agent reports what it offers.
 */
export function SessionOptions({ view }: { view: SessionView | null }) {
  const change = useMutation({
    mutationFn: async (choice: OptionChange) => {
      if (view !== null) {
        await setSessionOptions(view.id, choice);
      }
    },
  });
  if (view?.options === undefined) {
    return null;
  }
  return (
    <>
      <OptionPills
        options={view.options}
        disabled={view.status !== "idle" || change.isPending}
        onChange={(choice) => {
          change.mutate(choice);
        }}
      />
      {change.isError ? <span role="alert">Не сменилось: {change.error.message}</span> : null}
    </>
  );
}
