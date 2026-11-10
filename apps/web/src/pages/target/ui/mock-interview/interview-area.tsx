import { useEffect } from "react";

import type { InterviewView, QuestionCard as Card } from "@/shared/api";

import { useInterviewEvents } from "../../model/use-interview-events";
import { DiscussSeparately } from "./discuss-separately";
import { InterviewerChat } from "./interviewer-chat";
import { QuestionCard } from "./question-card";
import { InterviewHeader } from "./interview-header";
import { pauseText } from "./pause-controls";
import { SideThreads } from "./side-threads";

/** Whether the cards take answers: only while the Mock interview runs and is not finishing. */
function stageOf(view: InterviewView) {
  if (view.status === "paused") {
    return "paused";
  }
  if (view.status !== "running") {
    return "ended";
  }
  return view.finishRequestedAt === null ? "answering" : "finishing";
}

/** The question card with «Обсудить отдельно», and its Side threads to the right. */
function QuestionRow({ view, card, number }: { view: InterviewView; card: Card; number: number }) {
  return (
    <>
      <QuestionCard
        interviewId={view.id}
        targetId={view.targetId}
        card={card}
        number={number}
        stage={stageOf(view)}
        discuss={
          <DiscussSeparately
            edge
            interviewId={view.id}
            origin={{ kind: "question", id: card.id }}
          />
        }
      />
      <SideThreads view={view} card={card} number={number} />
    </>
  );
}

/**
 * The running or paused Mock interview: the header with «Пауза» or «Продолжить» and «Завершить»,
 * the question cards from top to bottom, the «Интервьюер» column beside the current question with
 * the chat of every interviewer session, and the Side threads to the right of theirs. `onChanged`
 * runs once its status changed from the one the zone knows: it ended, paused or went on.
 */
export function InterviewArea({
  interview,
  onChanged,
}: {
  interview: InterviewView;
  onChanged: () => void;
}) {
  const { view, lost } = useInterviewEvents(interview);
  const changed = view.status !== interview.status;
  useEffect(() => {
    if (changed) {
      onChanged();
    }
  }, [changed, onChanged]);
  const [first] = view.questions;
  const chat = (
    <InterviewerChat
      interviewId={view.id}
      sessionId={view.sessionId}
      discussFrom={first === undefined ? null : (first.chatPosition ?? 0)}
    />
  );
  const last = view.questions.length - 1;
  return (
    <section className="mock" aria-label="Мок-собеседование">
      <InterviewHeader view={view} />
      {view.status === "paused" ? (
        <p className="paused-note">{pauseText(view.pauseReason)}</p>
      ) : null}
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
              <QuestionRow view={view} card={card} number={index + 1} />
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
