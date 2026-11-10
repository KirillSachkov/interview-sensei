import { useId } from "react";

import { useReferenceChecks } from "../model/reference-checks";
import { ReferenceAnswerDetails, VerifyReference } from "./reference-answer";

/**
 * «Проверить опорный ответ» in the «Цель» zone: the Questions whose Grade the Candidate disputed or
 * whose reference answer the interviewer disagreed with, each with the reason, its reference answer
 * and «Проверен». «Исправить в чате» opens the setup
 * chat, where the agent corrects a reference answer through the draft of changes. The card shows
 * nothing while the list is empty.
 */
export function ReferenceChecks({ targetId, onFix }: { targetId: string; onFix: () => void }) {
  const titleId = useId();
  const checks = useReferenceChecks(targetId);
  if (checks.isError) {
    return (
      <p role="alert">Список «Проверить опорный ответ» не загрузился: {checks.error.message}</p>
    );
  }
  const questions = checks.data ?? [];
  if (questions.length === 0) {
    return null;
  }
  return (
    <article className="card" aria-labelledby={titleId}>
      <h3 id={titleId} className="card-title">
        Проверить опорный ответ ({questions.length})
      </h3>
      <ul className="questions reference-checks nowheel">
        {questions.map((question) => (
          <li key={question.id} className="question" aria-label={question.text}>
            <p>{question.text}</p>
            {question.referenceCheck === null ? null : (
              <p className="muted">
                {question.referenceCheck.reason === "interviewer"
                  ? "Интервьюер не согласен с опорным ответом"
                  : "Оспорена оценка"}
                : {question.referenceCheck.comment}
              </p>
            )}
            {question.referenceAnswer === null ? null : (
              <ReferenceAnswerDetails answer={question.referenceAnswer} />
            )}
            <div className="question-actions">
              <VerifyReference targetId={targetId} question={question} />
            </div>
          </li>
        ))}
      </ul>
      <button type="button" className="ghost" onClick={onFix}>
        Исправить в чате
      </button>
    </article>
  );
}
