import { useMutation } from "@tanstack/react-query";
import { useEffect } from "react";

import { finishInterview } from "@/shared/api";
import type { InterviewView } from "@/shared/api";

import { useInterviewEvents } from "../../model/use-interview-events";
import { InterviewerChat } from "./interviewer-chat";
import { QuestionCard } from "./question-card";
import { SectionStrip } from "./section-strip";
import { TimeLeft } from "./time-left";

function Header({ view }: { view: InterviewView }) {
  const finish = useMutation({ mutationFn: async () => finishInterview(view.id) });
  const finishing = view.finishRequestedAt !== null;
  return (
    <header className="mock-head">
      <h3>Мок-собеседование</h3>
      <span className="muted" aria-live="polite">
        {finishing ? "Интервьюер подводит итог…" : "идёт"}
      </span>
      {view.endsAt === null ? null : <TimeLeft endsAt={view.endsAt} />}
      <SectionStrip view={view} />
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
    </header>
  );
}

/** Whether the cards take answers: only while the Mock interview runs and is not finishing. */
function stageOf(view: InterviewView) {
  if (view.status !== "running") {
    return "ended";
  }
  return view.finishRequestedAt === null ? "answering" : "finishing";
}

/**
 * The running Mock interview: the header with «Завершить», the question cards from top to bottom,
 * and the «Интервьюер» column beside the current question. `onEnded` runs once it is no longer
 * running.
 */
export function InterviewArea({
  interview,
  onEnded,
}: {
  interview: InterviewView;
  onEnded: () => void;
}) {
  const { view, lost } = useInterviewEvents(interview);
  const running = view.status === "running";
  useEffect(() => {
    if (!running) {
      onEnded();
    }
  }, [running, onEnded]);
  const chat = <InterviewerChat sessionId={view.sessionId} />;
  const last = view.questions.length - 1;
  return (
    <section className="mock" aria-label="Мок-собеседование">
      <Header view={view} />
      {lost ? <p role="alert">Соединение с сервером потеряно. Обновите страницу.</p> : null}
      {view.questions.length === 0 ? (
        <div className="mock-row">
          {chat}
          <p className="muted" aria-live="polite">
            Интервьюер готовит первый вопрос…
          </p>
        </div>
      ) : (
        <ol className="mock-questions" aria-label="Вопросы">
          {view.questions.map((card, index) => (
            <li key={card.id} className="mock-row">
              {index === last ? chat : <div />}
              <QuestionCard
                interviewId={view.id}
                targetId={view.targetId}
                card={card}
                number={index + 1}
                stage={stageOf(view)}
              />
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
