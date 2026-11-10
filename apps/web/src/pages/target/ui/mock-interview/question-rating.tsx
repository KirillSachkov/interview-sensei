import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { fetchQuestionMarks, rateQuestion } from "@/shared/api";
import type { QuestionRating } from "@/shared/api";

const ratings: readonly { rating: QuestionRating; icon: string; label: string }[] = [
  { rating: "useful", icon: "👍", label: "Полезный вопрос" },
  { rating: "irrelevant", icon: "👎", label: "Вопрос не подходит" },
  { rating: "wrong", icon: "⚠", label: "В вопросе ошибка" },
];

const marksKey = (targetId: string) => ["targets", targetId, "question-marks"];

/** The marks of the Target's Questions: the Candidate's rating and «не подтверждён». */
function useQuestionMarks(targetId: string, questionId: string) {
  const marks = useQuery({
    queryKey: marksKey(targetId),
    queryFn: async () => fetchQuestionMarks(targetId),
  });
  return marks.data?.find((entry) => entry.id === questionId);
}

/** 👍 👎 ⚠ of the Question itself; a second press takes the rating back. */
function QuestionRatingButtons({ targetId, questionId }: { targetId: string; questionId: string }) {
  const queryClient = useQueryClient();
  const current = useQuestionMarks(targetId, questionId)?.rating ?? null;
  const rate = useMutation({
    mutationFn: async (rating: QuestionRating | null) => rateQuestion(questionId, rating),
    onSettled: async () => queryClient.invalidateQueries({ queryKey: marksKey(targetId) }),
  });
  return (
    <fieldset className="question-rating" aria-label="Оценка вопроса">
      {ratings.map(({ rating, icon, label }) => (
        <button
          key={rating}
          type="button"
          className="ghost rating"
          aria-label={label}
          title={label}
          aria-pressed={current === rating}
          disabled={rate.isPending}
          onClick={() => {
            rate.mutate(current === rating ? null : rating);
          }}
        >
          {icon} {label}
        </button>
      ))}
    </fieldset>
  );
}

/** Secondary question metadata and feedback stay behind one disclosure. */
export function QuestionDetails({
  targetId,
  questionId,
}: {
  targetId: string;
  questionId: string;
}) {
  const marks = useQuestionMarks(targetId, questionId);
  return (
    <details className="question-details nodrag nopan">
      <summary>О вопросе</summary>
      <div className="question-details-body">
        {marks === undefined ? null : (
          <p>
            {marks.unconfirmed
              ? "Вопрос создан агентом, источник не подтверждён."
              : "Вопрос подтверждён."}
          </p>
        )}
        <QuestionRatingButtons targetId={targetId} questionId={questionId} />
      </div>
    </details>
  );
}
