import type { TargetProgress, TopicProgress } from "@/shared/api";

import { useProgress } from "../../model/progress";
import { TopicDot, TopicStatusText, topicStatusNames } from "../topic-status";
import "./readiness.css";

/** «тем» after «из N», «темы» after 1, 21, 31 and so on. */
const topicsWord = (count: number) => (count % 10 === 1 && count % 100 !== 11 ? "темы" : "тем");

const percent = (part: number, total: number) => (total === 0 ? 0 : (part / total) * 100);

/** The bar by Topic status over the Topics of the enabled Sections. */
function ReadinessBar({ readiness }: { readiness: TargetProgress["readiness"] }) {
  const { confident, shaky, notStarted, total } = readiness;
  const parts = [
    { status: "confident", count: confident },
    { status: "shaky", count: shaky },
    { status: "not_started", count: notStarted },
  ] as const;
  return (
    <>
      <div className="readiness-bar" aria-hidden="true">
        {parts.map((part) => (
          <span
            key={part.status}
            className={`readiness-part ${part.status}`}
            style={{ width: `${percent(part.count, total)}%` }}
          />
        ))}
      </div>
      <ul className="readiness-legend">
        {parts.map((part) => (
          <li key={part.status}>
            <TopicDot status={part.status} /> {topicStatusNames[part.status]} {part.count}
          </li>
        ))}
      </ul>
    </>
  );
}

function TopicLine({ topic }: { topic: TopicProgress }) {
  return (
    <li className="topic-line">
      <TopicDot status={topic.status} />
      <span>
        {topic.name}
        <TopicStatusText status={topic.status} />
      </span>
    </li>
  );
}

function ReadinessBody({ progress }: { progress: TargetProgress }) {
  const { readiness, focus } = progress;
  return (
    <>
      <p className="readiness-main">
        <strong>
          {readiness.confident} из {readiness.total}
        </strong>{" "}
        {topicsWord(readiness.total)} уверенно
      </p>
      <ReadinessBar readiness={readiness} />
      <h4>Подтянуть в первую очередь</h4>
      {focus.length === 0 ? (
        <p className="muted">
          {readiness.total === 0 ? "Тем пока нет: их соберёт агент." : "Все темы уверенно."}
        </p>
      ) : (
        <ol className="focus-topics" aria-label="Подтянуть в первую очередь">
          {focus.map((topic) => (
            <TopicLine key={topic.id} topic={topic} />
          ))}
        </ol>
      )}
    </>
  );
}

/**
 * «Готовность» in the «Цель» zone: the confident Topics among those of the enabled Sections, the
 * bar by Topic status and three Topics «подтянуть в первую очередь». The Topic status dots of all
 * the plan's Topics stand on their chips in the plan.
 */
export function Readiness({ targetId }: { targetId: string }) {
  const { data, error } = useProgress(targetId);
  return (
    <section className="card readiness" aria-label="Готовность">
      <h3 className="card-title">Готовность</h3>
      {error === null ? null : <p role="alert">Готовность не загрузилась: {error.message}</p>}
      {data === undefined ? null : <ReadinessBody progress={data} />}
    </section>
  );
}
