import { useState } from "react";

import type { Difficulty } from "@/shared/api";

const limits: readonly { readonly value: number | null; readonly label: string }[] = [
  { value: null, label: "Без лимита" },
  { value: 30, label: "30 минут" },
  { value: 60, label: "60 минут" },
];

const difficulties: readonly { readonly value: Difficulty; readonly label: string }[] = [
  { value: "easier", label: "Легче" },
  { value: "as_is", label: "Как есть" },
  { value: "harder", label: "Сложнее" },
];

/** One choice of «Начать мок» as a group of radio buttons. */
function Choice<Value>({
  legend,
  name,
  options,
  value,
  onChange,
}: {
  legend: string;
  name: string;
  options: readonly { readonly value: Value; readonly label: string }[];
  value: Value;
  onChange: (value: Value) => void;
}) {
  return (
    <fieldset className="start-choice">
      <legend>{legend}</legend>
      <div className="start-options">
        {options.map((option) => (
          <label key={option.label} className="section-choice">
            <input
              type="radio"
              className="nodrag"
              name={name}
              checked={option.value === value}
              onChange={() => {
                onChange(option.value);
              }}
            />
            {option.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/**
 * The time limit and the difficulty of a new Mock interview, and their fields. No limit at first;
 * the difficulty starts as the Target keeps it.
 */
export function useStartSettings(lastDifficulty: Difficulty) {
  const [limitMinutes, setLimitMinutes] = useState<number | null>(null);
  const [difficulty, setDifficulty] = useState(lastDifficulty);
  const fields = (
    <>
      <Choice
        legend="Лимит времени"
        name="limit"
        options={limits}
        value={limitMinutes}
        onChange={setLimitMinutes}
      />
      <Choice
        legend="Сложность"
        name="difficulty"
        options={difficulties}
        value={difficulty}
        onChange={setDifficulty}
      />
      <p className="hint">Сложность сохранится у цели для следующих моков.</p>
    </>
  );
  return { limitMinutes, difficulty, fields };
}
