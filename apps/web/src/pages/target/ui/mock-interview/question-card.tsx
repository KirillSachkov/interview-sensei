import type { ReactNode } from "react";

import { answerQuestion } from "@/shared/api";
import type { QuestionCard as Card } from "@/shared/api";

import { AnswerForm } from "./answer-form";
import { Debrief } from "./debrief";
import { FollowUps } from "./follow-ups";
import { QuestionRatingButtons, useQuestionMarks } from "./question-rating";
import { QuizForm } from "./quiz-form";
import { SkipButton } from "./skip-button";

/** The form for the presented question: quiz options or free text, both with «Не знаю». */
function OpenAnswer({ interviewId, card }: { interviewId: string; card: Card }) {
  const skip = <SkipButton interviewId={interviewId} />;
  return card.format === "quiz" ? (
    <QuizForm interviewId={interviewId} card={card} actions={skip} />
  ) : (
    <AnswerForm
      label="Ваш ответ"
      send={async (text) => answerQuestion(interviewId, { text })}
      actions={skip}
    />
  );
}

/** The quiz options; after the answer the chosen ones carry a mark. */
function QuizOptions({ card }: { card: Card }) {
  const chosen = new Set(card.answer?.optionIds);
  return (
    <ul className="quiz-options">
      {card.options.map((option) => (
        <li key={option.id} className={chosen.has(option.id) ? "chosen" : undefined}>
          {chosen.has(option.id) ? "✓ " : ""}
          {option.text}
        </li>
      ))}
    </ul>
  );
}

/** The Candidate's answer as recorded: the text, the chosen options or «Не знаю». */
function GivenAnswer({ card }: { card: Card }) {
  const { answer } = card;
  if (answer === null) {
    return null;
  }
  if (answer.skipped) {
    return (
      <p className="answer-text">
        <span className="muted">Ваш ответ: </span>не знаю <span className="tag">пропущено</span>
      </p>
    );
  }
  return card.format === "quiz" ? null : (
    <p className="answer-text">
      <span className="muted">Ваш ответ: </span>
      {answer.text}
    </p>
  );
}

/**
 * Whether the Mock interview takes answers, runs without them while it finishes, waits on a pause,
 * or ended.
 */
type Stage = "answering" | "finishing" | "paused" | "ended";

/** What the card shows below the question: the answer form, or the answer and what follows it. */
function AnswerPart({
  interviewId,
  targetId,
  card,
  stage,
}: {
  interviewId: string;
  targetId: string;
  card: Card;
  stage: Stage;
}) {
  const canAnswer = stage === "answering";
  if (card.answer === null) {
    if (stage === "paused") {
      return <p className="muted">Ответ — после «Продолжить».</p>;
    }
    return canAnswer ? (
      <OpenAnswer interviewId={interviewId} card={card} />
    ) : (
      <p className="muted">Без ответа</p>
    );
  }
  return (
    <>
      <GivenAnswer card={card} />
      <FollowUps interviewId={interviewId} card={card} canAnswer={canAnswer} />
      <AttemptPart interviewId={interviewId} targetId={targetId} card={card} stage={stage} />
    </>
  );
}

/**
 * «Посмотреть разбор» once the Attempt is recorded; until then, that the interviewer judges. An
 * ended Mock interview gets no more Attempts.
 */
function AttemptPart({
  interviewId,
  targetId,
  card,
  stage,
}: {
  interviewId: string;
  targetId: string;
  card: Card;
  stage: Stage;
}) {
  if (card.attemptId !== null) {
    return (
      <Debrief
        interviewId={interviewId}
        attemptId={card.attemptId}
        question={{ targetId, questionId: card.questionId, topicId: card.topicId }}
      />
    );
  }
  if (stage === "ended") {
    return <p className="muted">Без оценки</p>;
  }
  if (stage === "paused") {
    return <p className="muted">Интервьюер оценит ответ после «Продолжить».</p>;
  }
  // A Follow-up waits for the Candidate, not for the interviewer.
  return card.followUps.at(-1)?.answer === null ? null : (
    <p className="muted" aria-live="polite">
      Интервьюер оценивает ответ…
    </p>
  );
}

/**
 * The marks above the question: «глубже», «не подтверждён», «с подсказкой» after a Side thread
 * before the answer, and the Candidate's rating.
 */
function CardMarks({ targetId, card }: { targetId: string; card: Card }) {
  const marks = useQuestionMarks(targetId, card.questionId);
  return (
    <div className="card-marks">
      {card.parentAttemptId === null ? null : <span className="tag accent">глубже</span>}
      {marks?.unconfirmed === true ? <span className="tag">не подтверждён</span> : null}
      {card.hinted ? <span className="tag">с подсказкой</span> : null}
      <QuestionRatingButtons targetId={targetId} questionId={card.questionId} />
    </div>
  );
}

/**
 * One question of the interviewer as a card: the question, the answer and its Debrief. `discuss`
 * is «Обсудить отдельно», where the card opens Side threads.
 */
export function QuestionCard({
  interviewId,
  targetId,
  card,
  number,
  stage,
  discuss = null,
}: {
  interviewId: string;
  targetId: string;
  card: Card;
  number: number;
  stage: Stage;
  discuss?: ReactNode;
}) {
  const answering = stage === "answering" && card.answer === null;
  return (
    <article className="card question-card" aria-label={`Вопрос ${number}`} data-discuss-scope="">
      <CardMarks targetId={targetId} card={card} />
      <p className="question-text">{card.text}</p>
      {card.format === "quiz" && !answering ? <QuizOptions card={card} /> : null}
      <AnswerPart interviewId={interviewId} targetId={targetId} card={card} stage={stage} />
      {discuss}
    </article>
  );
}
