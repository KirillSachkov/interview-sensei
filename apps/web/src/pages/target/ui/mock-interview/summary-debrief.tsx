import { useQuery } from "@tanstack/react-query";

import { fetchInterviewSummary } from "@/shared/api";
import type { InterviewSummary } from "@/shared/api";

import { TopicDot, topicStatusNames } from "../topic-status";

function TopicChanges({ changes }: { changes: InterviewSummary["topicChanges"] }) {
  if (changes.length === 0) {
    return <p className="muted">Оценённых ответов нет: статусы тем не изменились.</p>;
  }
  return (
    <ul className="topic-changes" aria-label="Изменения тем">
      {changes.map((change) => (
        <li key={change.id}>
          <span>{change.name ?? "Тема удалена из плана"}: </span>
          {change.before === change.after ? (
            <>
              <TopicDot status={change.after} /> {topicStatusNames[change.after]}, без изменений
            </>
          ) : (
            <>
              <TopicDot status={change.before} /> {topicStatusNames[change.before]} →{" "}
              <TopicDot status={change.after} /> {topicStatusNames[change.after]}
            </>
          )}
        </li>
      ))}
    </ul>
  );
}

/**
 * The summary Debrief of an ended Mock interview: the Topic status changes, the questions left
 * without an answer, and the agent's summary and next step when it wrote them.
 */
export function SummaryDebrief({ interviewId }: { interviewId: string }) {
  const summary = useQuery({
    queryKey: ["interviews", interviewId, "summary"],
    queryFn: async () => fetchInterviewSummary(interviewId),
  });
  if (summary.isError) {
    return <p role="alert">Итог не загрузился: {summary.error.message}</p>;
  }
  if (summary.data === undefined) {
    return <p className="muted">Загружаем итог…</p>;
  }
  const { topicChanges, unanswered, summary: text, nextStep } = summary.data;
  return (
    <section className="debrief summary-debrief" aria-label="Итоговый разбор">
      <h4>Изменения тем</h4>
      <TopicChanges changes={topicChanges} />
      {unanswered === 0 ? null : <p className="muted">Без ответа: {unanswered}</p>}
      <h4>Итог интервьюера</h4>
      <p>{text ?? "Интервьюер не написал итог."}</p>
      {nextStep === null ? null : (
        <>
          <h4>Следующий шаг</h4>
          <p>{nextStep}</p>
        </>
      )}
    </section>
  );
}
