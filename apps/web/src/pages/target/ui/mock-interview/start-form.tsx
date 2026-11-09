import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import type { SubmitEvent } from "react";

import { fetchPlanSections, startInterview } from "@/shared/api";
import type { InterviewView, PlanSection } from "@/shared/api";

/** The Sections the Candidate checked; all enabled ones at first. */
function useChosenSections(sections: readonly PlanSection[]) {
  const [chosen, setChosen] = useState(
    () => new Set(sections.filter((section) => section.enabled).map((section) => section.id)),
  );
  const toggle = (id: string) => {
    setChosen((current) => {
      const next = new Set(current);
      if (!next.delete(id)) {
        next.add(id);
      }
      return next;
    });
  };
  return { chosen, toggle };
}

function SectionChoices({
  sections,
  chosen,
  onToggle,
}: {
  sections: readonly PlanSection[];
  chosen: ReadonlySet<string>;
  onToggle: (id: string) => void;
}) {
  return (
    <fieldset>
      <legend>Секции плана</legend>
      {sections.map((section) => (
        <label key={section.id} className="section-choice">
          <input
            type="checkbox"
            className="nodrag"
            checked={chosen.has(section.id)}
            disabled={!section.enabled}
            onChange={() => {
              onToggle(section.id);
            }}
          />
          {section.name}
          {section.enabled ? null : <span className="tag">выключена</span>}
        </label>
      ))}
    </fieldset>
  );
}

/** The dialog «Начать мок»: the Sections to train. */
function StartDialog({
  targetId,
  sections,
  onStarted,
  onCancel,
}: {
  targetId: string;
  sections: readonly PlanSection[];
  onStarted: (interview: InterviewView) => void;
  onCancel: () => void;
}) {
  const { chosen, toggle } = useChosenSections(sections);
  const start = useMutation({
    mutationFn: async () =>
      startInterview(
        targetId,
        sections.filter((section) => chosen.has(section.id)).map((section) => section.id),
      ),
    onSuccess: onStarted,
  });
  const submit = (event: SubmitEvent) => {
    event.preventDefault();
    start.mutate();
  };
  return (
    <dialog open className="card start-dialog" aria-label="Начать мок">
      <form onSubmit={submit}>
        <SectionChoices sections={sections} chosen={chosen} onToggle={toggle} />
        <div className="dialog-actions">
          <button type="submit" className="primary" disabled={chosen.size === 0 || start.isPending}>
            Начать
          </button>
          <button type="button" className="ghost" onClick={onCancel}>
            Отмена
          </button>
        </div>
        {chosen.size === 0 ? <p className="hint">Выберите хотя бы одну секцию.</p> : null}
        {start.isError ? <p role="alert">Мок не начался: {start.error.message}</p> : null}
      </form>
    </dialog>
  );
}

function StartButton({
  disabled,
  noSections,
  onOpen,
}: {
  disabled: boolean;
  noSections: boolean;
  onOpen: () => void;
}) {
  return (
    <>
      <button
        type="button"
        className="primary big"
        disabled={disabled || noSections}
        aria-describedby={noSections ? "no-sections" : undefined}
        onClick={onOpen}
      >
        Начать мок
      </button>
      {noSections ? (
        <p id="no-sections" className="hint">
          В плане нет включённых секций: включите хотя бы одну, чтобы начать мок.
        </p>
      ) : null}
    </>
  );
}

/** «Начать мок» and its dialog; the button explains why it is off without enabled Sections. */
export function StartMock({
  targetId,
  onStarted,
}: {
  targetId: string;
  onStarted: (interview: InterviewView) => void;
}) {
  const [open, setOpen] = useState(false);
  const sections = useQuery({
    queryKey: ["targets", targetId, "plan-sections"],
    queryFn: async () => fetchPlanSections(targetId),
  });
  if (sections.isError) {
    return <p role="alert">План цели не загрузился: {sections.error.message}</p>;
  }
  const plan = sections.data ?? [];
  return (
    <div className="start-mock">
      <StartButton
        disabled={sections.data === undefined || open}
        noSections={sections.data !== undefined && !plan.some((section) => section.enabled)}
        onOpen={() => {
          setOpen(true);
        }}
      />
      {open ? (
        <StartDialog
          targetId={targetId}
          sections={plan}
          onStarted={(interview) => {
            setOpen(false);
            onStarted(interview);
          }}
          onCancel={() => {
            setOpen(false);
          }}
        />
      ) : null}
    </div>
  );
}
