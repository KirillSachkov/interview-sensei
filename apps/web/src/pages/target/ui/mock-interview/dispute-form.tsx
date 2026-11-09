import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import type { SubmitEvent } from "react";

import { disputeGrade } from "@/shared/api";

const grades = [0, 1, 2, 3] as const;

function GradeChoice({
  grade,
  onChoose,
}: {
  grade: number | null;
  onChoose: (grade: number) => void;
}) {
  return (
    <fieldset>
      <legend>Новая оценка</legend>
      {grades.map((value) => (
        <label key={value} className="grade-choice">
          <input
            type="radio"
            name="grade"
            className="nodrag"
            checked={grade === value}
            onChange={() => {
              onChoose(value);
            }}
          />
          {value}
        </label>
      ))}
    </fieldset>
  );
}

/** Saves the Dispute; the Debrief, the summary Debrief, the Readiness and the history reload. */
function useSaveDispute(interviewId: string, attemptId: string, onSaved: () => void) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (dispute: { grade: number; reason: string }) =>
      disputeGrade(interviewId, { attemptId, ...dispute }),
    onSuccess: async () => {
      await Promise.all(
        [["interviews", interviewId], ["progress"], ["history"]].map(async (queryKey) =>
          queryClient.invalidateQueries({ queryKey }),
        ),
      );
      onSaved();
    },
  });
}

/** «Оспорить оценку»: a new Grade from 0 to 3 and a required reason; it applies at once. */
export function DisputeForm({
  interviewId,
  attemptId,
  onClose,
}: {
  interviewId: string;
  attemptId: string;
  onClose: () => void;
}) {
  const [grade, setGrade] = useState<number | null>(null);
  const [reason, setReason] = useState("");
  const save = useSaveDispute(interviewId, attemptId, onClose);
  const submit = (event: SubmitEvent) => {
    event.preventDefault();
    if (grade !== null && reason.trim() !== "") {
      save.mutate({ grade, reason });
    }
  };
  return (
    <form className="dispute-form" aria-label="Оспорить оценку" onSubmit={submit}>
      <GradeChoice grade={grade} onChoose={setGrade} />
      <label className="dispute-reason">
        Причина
        <textarea
          className="nodrag nopan nowheel"
          rows={2}
          required
          value={reason}
          onChange={(event) => {
            setReason(event.target.value);
          }}
        />
      </label>
      <div className="answer-actions">
        <button
          type="submit"
          className="primary"
          disabled={grade === null || reason.trim() === "" || save.isPending}
        >
          Сохранить
        </button>
        <button type="button" className="ghost" onClick={onClose}>
          Отмена
        </button>
      </div>
      {save.isError ? <p role="alert">Оценка не исправлена: {save.error.message}</p> : null}
    </form>
  );
}
