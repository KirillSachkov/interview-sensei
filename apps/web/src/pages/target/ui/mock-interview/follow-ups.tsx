import { answerFollowUp } from "@/shared/api";
import type { QuestionCard } from "@/shared/api";

import { AnswerForm } from "./answer-form";

/** The answer to one Follow-up, its form while it waits, or that it got none. */
function FollowUpAnswer({
  interviewId,
  answer,
  canAnswer,
}: {
  interviewId: string;
  answer: string | null;
  canAnswer: boolean;
}) {
  if (answer !== null) {
    return (
      <p className="answer-text nodrag nopan nowheel">
        <span className="muted">Ваш ответ: </span>
        {answer}
      </p>
    );
  }
  return canAnswer ? (
    <AnswerForm
      label="Ответ на уточнение"
      send={async (text) => answerFollowUp(interviewId, text)}
    />
  ) : (
    <p className="muted">Без ответа</p>
  );
}

/** The interviewer's Follow-ups under the answer; the last one takes an answer while it has none. */
export function FollowUps({
  interviewId,
  card,
  canAnswer,
}: {
  interviewId: string;
  card: QuestionCard;
  canAnswer: boolean;
}) {
  if (card.followUps.length === 0) {
    return null;
  }
  return (
    <ol className="follow-ups" aria-label="Уточнения">
      {card.followUps.map((followUp) => (
        <li key={followUp.askedAt + followUp.question} className="follow-up">
          <p className="follow-up-question">{followUp.question}</p>
          <FollowUpAnswer
            interviewId={interviewId}
            answer={followUp.answer}
            canAnswer={canAnswer}
          />
        </li>
      ))}
    </ol>
  );
}
