import { useMutation } from "@tanstack/react-query";

import { agentName } from "@/entities/agent";
import { AgentUnavailableError, pauseInterview, resumeInterview } from "@/shared/api";
import type { InterviewView } from "@/shared/api";

/** «Пауза»: the timer stops and the interviewer stops at once; the question waits. */
export function PauseButton({ view, disabled }: { view: InterviewView; disabled: boolean }) {
  const pause = useMutation({ mutationFn: async () => pauseInterview(view.id) });
  return (
    <>
      <button
        type="button"
        disabled={disabled || pause.isPending}
        onClick={() => {
          pause.mutate();
        }}
      >
        Пауза
      </button>
      {pause.isError ? <p role="alert">Мок не встал на паузу: {pause.error.message}</p> : null}
    </>
  );
}

/** Why the Mock interview is paused, for the Candidate. */
export function pauseText(reason: InterviewView["pauseReason"]): string {
  switch (reason) {
    case "agent_failed": {
      return "Агент интервьюера остановился, и мок встал на паузу. Ответы сохранены.";
    }
    case "server_stopped": {
      return "Приложение перезапускалось, и мок встал на паузу. Ответы сохранены.";
    }
    case "candidate":
    case null: {
      return "Мок на паузе: таймер стоит, вопрос ждёт вас.";
    }
    default: {
      return reason satisfies never;
    }
  }
}

/**
 * The choice when the agent of the Mock interview is unavailable: the reason and, when the
 * Target's agent can run, going on with it. The Mock interview keeps that agent from then on.
 */
function OtherAgentChoice({
  error,
  onChoose,
  pending,
}: {
  error: AgentUnavailableError;
  onChoose: (agent: string) => void;
  pending: boolean;
}) {
  const { targetAgent } = error;
  return (
    <dialog open className="card resume-dialog" aria-label="Агент мока недоступен">
      <p role="alert">{error.message}</p>
      {targetAgent === null ? null : (
        <div className="dialog-actions">
          <button
            type="button"
            className="primary"
            disabled={pending}
            onClick={() => {
              onChoose(targetAgent);
            }}
          >
            Продолжить с агентом «{agentName(targetAgent)}»
          </button>
        </div>
      )}
    </dialog>
  );
}

/**
 * «Продолжить»: a new interviewer session goes on from where the Mock interview stopped. When its
 * agent is unavailable, the Candidate sees why and may go on with the Target's agent.
 */
export function ResumeButton({
  view,
  className = "primary",
}: {
  view: InterviewView;
  className?: string;
}) {
  const resume = useMutation({
    mutationFn: async (agent: string | null) => resumeInterview(view.id, agent ?? undefined),
  });
  const { error } = resume;
  return (
    <>
      <button
        type="button"
        className={className}
        disabled={resume.isPending}
        onClick={() => {
          resume.mutate(null);
        }}
      >
        Продолжить
      </button>
      {error instanceof AgentUnavailableError ? (
        <OtherAgentChoice
          error={error}
          pending={resume.isPending}
          onChoose={(agent) => {
            resume.mutate(agent);
          }}
        />
      ) : null}
      {error !== null && !(error instanceof AgentUnavailableError) ? (
        <p role="alert">Мок не продолжился: {error.message}</p>
      ) : null}
    </>
  );
}
