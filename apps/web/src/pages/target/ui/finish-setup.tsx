import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { applyDraft, discardDraft, DraftProblemsError, endSetupSession } from "@/shared/api";

import { useDraft } from "./draft-changes";

/** What happens to a non-empty draft when the Candidate ends the setup session. */
type DraftChoice = "apply" | "keep" | "discard";

async function finish(targetId: string, choice: DraftChoice): Promise<void> {
  if (choice === "apply") {
    await applyDraft(targetId);
  }
  if (choice === "discard") {
    await discardDraft(targetId);
  }
  await endSetupSession(targetId);
}

function failureText(error: Error): string {
  return error instanceof DraftProblemsError
    ? `Черновик не применён: ${error.problems.join(" ")}`
    : `Сессия не завершилась: ${error.message}`;
}

/** The choice for a non-empty draft: «Применить», «Оставить черновик» or «Отменить изменения». */
function DraftQuestion({
  size,
  disabled,
  onChoose,
}: {
  size: number;
  disabled: boolean;
  onChoose: (choice: DraftChoice) => void;
}) {
  const choices = [
    ["apply", "Применить", "primary"],
    ["keep", "Оставить черновик", "ghost"],
    ["discard", "Отменить изменения", "ghost"],
  ] as const;
  return (
    <dialog open className="finish-setup" aria-labelledby="finish-setup-title">
      <p id="finish-setup-title">
        Есть неприменённые изменения ({size}). Что сделать с ними перед завершением?
      </p>
      <div className="draft-actions">
        {choices.map(([choice, label, style]) => (
          <button
            key={choice}
            type="button"
            className={style}
            disabled={disabled}
            onClick={() => {
              onChoose(choice);
            }}
          >
            {label}
          </button>
        ))}
      </div>
    </dialog>
  );
}

/**
 * «Завершить»: ends the Target's setup session. With a non-empty draft it first asks what to do
 * with the draft; the next opening starts a new session.
 */
export function FinishSetup({
  targetId,
  onFinished,
}: {
  targetId: string;
  onFinished: () => void;
}) {
  const queryClient = useQueryClient();
  const draft = useDraft(targetId);
  const [asking, setAsking] = useState(false);
  const ending = useMutation({
    mutationFn: async (choice: DraftChoice) => finish(targetId, choice),
    onSuccess: async () => {
      queryClient.removeQueries({ queryKey: ["targets", targetId, "setup-session"] });
      onFinished();
      await queryClient.invalidateQueries({ queryKey: ["targets"] });
      await queryClient.invalidateQueries({ queryKey: ["progress", targetId] });
    },
  });
  const size = draft.data?.length ?? 0;
  return (
    <>
      <button
        type="button"
        className="ghost"
        disabled={ending.isPending}
        onClick={() => {
          if (size > 0) {
            setAsking(true);
          } else {
            ending.mutate("keep");
          }
        }}
      >
        Завершить
      </button>
      {asking && size > 0 ? (
        <DraftQuestion
          size={size}
          disabled={ending.isPending}
          onChoose={(choice) => {
            ending.mutate(choice);
          }}
        />
      ) : null}
      {ending.isError ? <p role="alert">{failureText(ending.error)}</p> : null}
    </>
  );
}
