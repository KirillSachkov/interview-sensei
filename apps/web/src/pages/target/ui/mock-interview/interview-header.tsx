import { useMutation } from "@tanstack/react-query";

import { finishInterview } from "@/shared/api";
import type { InterviewView } from "@/shared/api";

import { PauseButton, ResumeButton } from "./pause-controls";
import { SectionStrip } from "./section-strip";
import { PausedTimeLeft, TimeLeft } from "./time-left";

/** The time left: running while the Mock interview runs, standing on a pause. */
function Timer({ view }: { view: InterviewView }) {
  if (view.endsAt !== null) {
    return <TimeLeft endsAt={view.endsAt} />;
  }
  return view.timeLeftMs === null ? null : <PausedTimeLeft leftMs={view.timeLeftMs} />;
}

function stateText(view: InterviewView): string {
  if (view.status === "paused") {
    return "на паузе";
  }
  return view.finishRequestedAt === null ? "идёт" : "Интервьюер подводит итог…";
}

/** The header of the running or paused Mock interview: its state, time, Sections and actions. */
export function InterviewHeader({ view }: { view: InterviewView }) {
  const finish = useMutation({ mutationFn: async () => finishInterview(view.id) });
  const finishing = view.finishRequestedAt !== null;
  const paused = view.status === "paused";
  return (
    <header className="mock-head">
      <h3>Мок-собеседование</h3>
      <span className="muted" aria-live="polite">
        {stateText(view)}
      </span>
      <Timer view={view} />
      <SectionStrip view={view} />
      <div className="mock-actions">
        {paused ? <ResumeButton view={view} /> : <PauseButton view={view} disabled={finishing} />}
        <button
          type="button"
          disabled={finishing || finish.isPending}
          onClick={() => {
            finish.mutate();
          }}
        >
          Завершить
        </button>
        {finish.isError ? <p role="alert">Мок не завершился: {finish.error.message}</p> : null}
      </div>
    </header>
  );
}
