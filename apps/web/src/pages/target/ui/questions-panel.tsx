import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { fetchQuestions, hideQuestion, rateQuestion } from "@/shared/api";
import type { Question, QuestionRating } from "@/shared/api";

import { ReferenceAnswerDetails, VerifyReference } from "./reference-answer";
import type { QuestionsView } from "./target-plan";

const ratings: readonly { rating: QuestionRating; mark: string; label: string }[] = [
  { rating: "useful", mark: "👍", label: "Полезный" },
  { rating: "irrelevant", mark: "👎", label: "Не по теме" },
  { rating: "wrong", mark: "⚠", label: "Ошибка в вопросе" },
];

/** Writes at once and refreshes the Target's Questions and their counts in the plan. */
function useQuestionWrite<Variables>(
  targetId: string,
  write: (variables: Variables) => Promise<void>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: write,
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["targets", targetId, "questions"] }),
        queryClient.invalidateQueries({ queryKey: ["targets", targetId], exact: true }),
      ]);
    },
  });
}

/** 👍 👎 ⚠: a pressed rating pressed again clears it. */
function QuestionRatings({
  rating: current,
  onRate,
}: {
  rating: QuestionRating | null;
  onRate: (rating: QuestionRating | null) => void;
}) {
  return (
    <span className="question-rating">
      {ratings.map(({ rating, mark, label }) => (
        <button
          key={rating}
          type="button"
          className="ghost"
          aria-label={label}
          title={label}
          aria-pressed={current === rating}
          onClick={() => {
            onRate(current === rating ? null : rating);
          }}
        >
          {mark}
        </button>
      ))}
    </span>
  );
}

function QuestionItem({ targetId, question }: { targetId: string; question: Question }) {
  const hide = useQuestionWrite(targetId, async (hidden: boolean) =>
    hideQuestion(question.id, hidden),
  );
  const rate = useQuestionWrite(targetId, async (rating: QuestionRating | null) =>
    rateQuestion(question.id, rating),
  );
  const failure = hide.error ?? rate.error;
  return (
    <li className="question" aria-label={question.text}>
      <p>{question.text}</p>
      {question.referenceAnswer === null ? null : (
        <ReferenceAnswerDetails answer={question.referenceAnswer} />
      )}
      <div className="question-actions">
        {question.hidden ? null : (
          <QuestionRatings
            rating={question.rating}
            onRate={(rating) => {
              rate.mutate(rating);
            }}
          />
        )}
        <span className="question-tools">
          <VerifyReference targetId={targetId} question={question} />
          <button
            type="button"
            className="ghost"
            onClick={() => {
              hide.mutate(!question.hidden);
            }}
          >
            {question.hidden ? "Вернуть" : "Скрыть"}
          </button>
        </span>
      </div>
      {failure === null ? null : <p role="alert">Не сохранилось: {failure.message}</p>}
    </li>
  );
}

function QuestionList({
  targetId,
  view,
  hidden,
}: {
  targetId: string;
  view: QuestionsView;
  hidden: boolean;
}) {
  const questions = useQuery({
    queryKey: ["targets", targetId, "questions", view.scope, hidden],
    queryFn: async () => fetchQuestions(targetId, view.scope, hidden),
  });
  if (questions.isError) {
    return <p role="alert">Вопросы не загрузились: {questions.error.message}</p>;
  }
  const items = questions.data ?? [];
  if (hidden && items.length === 0) {
    return null;
  }
  return (
    <section className="question-group" aria-label={hidden ? "Скрытые вопросы" : "Вопросы"}>
      {hidden ? <h3>Скрытые ({items.length})</h3> : null}
      {!hidden && questions.data?.length === 0 ? <p className="muted">Вопросов нет.</p> : null}
      <ul className="questions nowheel">
        {items.map((question) => (
          <QuestionItem key={question.id} targetId={targetId} question={question} />
        ))}
      </ul>
    </section>
  );
}

/**
 * The side panel with the Questions of a Section or a Topic and their reference answers: «Скрыть»,
 * «Вернуть», the Question rating 👍 👎 ⚠ and «Проверен» write at once, without the draft of changes.
 */
export function QuestionsPanel({
  targetId,
  view,
  onClose,
}: {
  targetId: string;
  view: QuestionsView;
  onClose: () => void;
}) {
  return (
    <aside className="island side-panel" aria-labelledby="questions-panel-title">
      <header className="setup-chat-head">
        <h2 id="questions-panel-title">Вопросы: {view.title}</h2>
        <button type="button" className="ghost" onClick={onClose}>
          Закрыть
        </button>
      </header>
      <div className="side-panel-body">
        <QuestionList targetId={targetId} view={view} hidden={false} />
        <QuestionList targetId={targetId} view={view} hidden />
      </div>
    </aside>
  );
}
