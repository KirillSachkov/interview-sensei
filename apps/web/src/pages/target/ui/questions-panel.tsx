import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { fetchQuestions, hideQuestion, rateQuestion } from "@/shared/api";
import type { Question, QuestionRating } from "@/shared/api";

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
      <div className="question-actions">
        {question.hidden ? null : (
          <span className="question-rating">
            {ratings.map(({ rating, mark, label }) => (
              <button
                key={rating}
                type="button"
                className="ghost"
                aria-label={label}
                title={label}
                aria-pressed={question.rating === rating}
                onClick={() => {
                  rate.mutate(question.rating === rating ? null : rating);
                }}
              >
                {mark}
              </button>
            ))}
          </span>
        )}
        <button
          type="button"
          className="ghost"
          onClick={() => {
            hide.mutate(!question.hidden);
          }}
        >
          {question.hidden ? "Вернуть" : "Скрыть"}
        </button>
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
 * The side panel with the Questions of a Section or a Topic: «Скрыть», «Вернуть» and the Question
 * rating 👍 👎 ⚠ write at once, without the draft of changes.
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
