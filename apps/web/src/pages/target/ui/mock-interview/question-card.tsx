import type { QuestionCard as Card } from "@/shared/api";

import { AnswerForm } from "./answer-form";
import { Debrief } from "./debrief";

/** What the card shows below the question: the answer form, the answer, or that it has none. */
function AnswerPart({
  interviewId,
  card,
  canAnswer,
}: {
  interviewId: string;
  card: Card;
  canAnswer: boolean;
}) {
  if (card.answer === null) {
    if (!canAnswer) {
      return <p className="muted">Без ответа</p>;
    }
    return card.format === "open" ? <AnswerForm interviewId={interviewId} /> : null;
  }
  return (
    <>
      <p className="answer-text">
        <span className="muted">Ваш ответ: </span>
        {card.answer.skipped ? "не знаю" : card.answer.text}
      </p>
      {card.attemptId === null ? (
        <p className="muted" aria-live="polite">
          Интервьюер оценивает ответ…
        </p>
      ) : (
        <Debrief interviewId={interviewId} attemptId={card.attemptId} />
      )}
    </>
  );
}

/** One question of the interviewer as a card: the question, the answer and its Debrief. */
export function QuestionCard({
  interviewId,
  card,
  number,
  canAnswer,
}: {
  interviewId: string;
  card: Card;
  number: number;
  canAnswer: boolean;
}) {
  return (
    <article className="card question-card" aria-label={`Вопрос ${number}`}>
      <p className="question-text">{card.text}</p>
      {card.format === "quiz" ? (
        <ul className="quiz-options">
          {card.options.map((option) => (
            <li key={option.id}>{option.text}</li>
          ))}
        </ul>
      ) : null}
      <AnswerPart interviewId={interviewId} card={card} canAnswer={canAnswer} />
    </article>
  );
}
