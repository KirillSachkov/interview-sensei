import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import type { ReactNode, SubmitEvent } from "react";
import { createPortal } from "react-dom";

import { fetchPlanSections, finishInterview, startInterview } from "@/shared/api";
import type { Difficulty, InterviewView, PlanSection } from "@/shared/api";

import { ResumeButton } from "./pause-controls";
import { useStartSettings } from "./start-settings";
import "./mock-interview.css";

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
    <fieldset className="start-choice">
      <legend>Секции плана</legend>
      <div className="start-options start-sections">
        {sections.map((section) => (
          <label key={section.id} className="section-choice">
            <input
              type="checkbox"
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
      </div>
    </fieldset>
  );
}

/** The dialog «Начать мок»: the Sections to train, the time limit and the difficulty. */
function StartDialog({
  targetId,
  sections,
  difficulty: lastDifficulty,
  onStarted,
  onCancel,
}: {
  targetId: string;
  sections: readonly PlanSection[];
  difficulty: Difficulty;
  onStarted: (interview: InterviewView) => void;
  onCancel: () => void;
}) {
  const { chosen, toggle } = useChosenSections(sections);
  const settings = useStartSettings(lastDifficulty);
  const start = useMutation({
    mutationFn: async () =>
      startInterview(targetId, {
        sectionIds: sections
          .filter((section) => chosen.has(section.id))
          .map((section) => section.id),
        limitMinutes: settings.limitMinutes,
        difficulty: settings.difficulty,
      }),
    onSuccess: onStarted,
  });
  const submit = (event: SubmitEvent) => {
    event.preventDefault();
    start.mutate();
  };
  return (
    <StartWindow label="Начать мок" title="Новое мок-собеседование">
      <form onSubmit={submit}>
        <SectionChoices sections={sections} chosen={chosen} onToggle={toggle} />
        {settings.fields}
        {chosen.size === 0 ? <p className="hint">Выберите хотя бы одну секцию.</p> : null}
        {start.isError ? <p role="alert">Мок не начался: {start.error.message}</p> : null}
        <StartActions disabled={chosen.size === 0 || start.isPending} onCancel={onCancel} />
      </form>
    </StartWindow>
  );
}

function StartActions({ disabled, onCancel }: { disabled: boolean; onCancel: () => void }) {
  return (
    <div className="dialog-actions">
      <button type="button" className="ghost" onClick={onCancel}>
        Отмена
      </button>
      <button type="submit" className="primary big" disabled={disabled}>
        Начать
      </button>
    </div>
  );
}

/**
 * A window in the middle of the page over the dimmed canvas. It lives in the page's body: inside
 * a zone the canvas would scale and move it with the zone.
 */
function StartWindow({
  label,
  title,
  children,
}: {
  label: string;
  title: string;
  children: ReactNode;
}) {
  return createPortal(
    <div className="dialog-backdrop">
      <dialog open aria-modal="true" aria-label={label} className="island dialog start-dialog">
        <h2>{title}</h2>
        {children}
      </dialog>
    </div>,
    document.body,
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
        Начать мок-собеседование
      </button>
      {noSections ? (
        <p id="no-sections" className="hint">
          В плане нет включённых секций: включите хотя бы одну, чтобы начать мок.
        </p>
      ) : null}
    </>
  );
}

/**
 * The choice of «Начать мок» while the Target has a paused Mock interview: continue it, or finish
 * it with its summary Debrief and start a new one.
 */
function PausedChoice({
  paused,
  onFinished,
  onCancel,
}: {
  paused: InterviewView;
  onFinished: () => void;
  onCancel: () => void;
}) {
  const finish = useMutation({
    mutationFn: async () => finishInterview(paused.id),
    onSuccess: onFinished,
  });
  return (
    <StartWindow label="Мок на паузе" title="Мок на паузе">
      <p>По этой цели есть мок на паузе. Продолжите его или завершите, чтобы начать новый.</p>
      {finish.isError ? <p role="alert">Мок не завершился: {finish.error.message}</p> : null}
      <div className="dialog-actions">
        <button type="button" className="ghost" onClick={onCancel}>
          Отмена
        </button>
        <button
          type="button"
          disabled={finish.isPending}
          onClick={() => {
            finish.mutate();
          }}
        >
          Завершить и начать новый
        </button>
        <ResumeButton view={paused} />
      </div>
    </StartWindow>
  );
}

/** The Sections of the Target's plan for the dialog. */
function usePlanSections(targetId: string) {
  return useQuery({
    queryKey: ["targets", targetId, "plan-sections"],
    queryFn: async () => fetchPlanSections(targetId),
  });
}

/**
 * «Начать мок-собеседование» and its window in the middle of the page; the button explains why it
 * is off without enabled Sections. The window starts with the difficulty the Target keeps. With a `paused` Mock interview the button
 * first offers to continue it or to finish it; `onFinished` runs once it is finished.
 */
export function StartMock({
  targetId,
  difficulty,
  paused,
  onFinished,
  onStarted,
}: {
  targetId: string;
  difficulty: Difficulty;
  paused: InterviewView | null;
  onFinished: () => void;
  onStarted: (interview: InterviewView) => void;
}) {
  const [open, setOpen] = useState(false);
  const close = setOpen.bind(null, false);
  const sections = usePlanSections(targetId);
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
      {open && paused !== null ? (
        <PausedChoice paused={paused} onFinished={onFinished} onCancel={close} />
      ) : null}
      {open && paused === null ? (
        <StartDialog
          targetId={targetId}
          sections={plan}
          difficulty={difficulty}
          onStarted={(interview) => {
            close();
            onStarted(interview);
          }}
          onCancel={close}
        />
      ) : null}
    </div>
  );
}
