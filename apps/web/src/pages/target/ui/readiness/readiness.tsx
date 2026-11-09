import { useQuery } from "@tanstack/react-query";

import { fetchPlanSections, fetchProgress } from "@/shared/api";
import type { PlanSection, TargetProgress, TopicProgress } from "@/shared/api";

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

/** The plan's Sections with the Topic status dot of each Topic. */
function PlanTopics({
  sections,
  topics,
}: {
  sections: readonly PlanSection[];
  topics: readonly TopicProgress[];
}) {
  return (
    <ul className="plan-topics" aria-label="Темы плана">
      {sections.map((section) => (
        <li key={section.id}>
          <span className={section.enabled ? undefined : "muted"}>{section.name}</span>
          <ul>
            {topics
              .filter((topic) => topic.sectionIds.includes(section.id))
              .map((topic) => (
                <TopicLine key={topic.id} topic={topic} />
              ))}
          </ul>
        </li>
      ))}
    </ul>
  );
}

function ReadinessBody({
  progress,
  sections,
}: {
  progress: TargetProgress;
  sections: readonly PlanSection[];
}) {
  const { readiness, focus, topics } = progress;
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
        <p className="muted">Все темы уверенно.</p>
      ) : (
        <ol className="focus-topics" aria-label="Подтянуть в первую очередь">
          {focus.map((topic) => (
            <TopicLine key={topic.id} topic={topic} />
          ))}
        </ol>
      )}
      <h4>Темы плана</h4>
      <PlanTopics sections={sections} topics={topics} />
    </>
  );
}

/**
 * «Готовность» in the «Цель» zone: the confident Topics among those of the enabled Sections, the
 * bar by Topic status, three Topics «подтянуть в первую очередь» and the Topic status dots of the
 * plan's Topics.
 */
export function Readiness({ targetId }: { targetId: string }) {
  const progress = useQuery({
    queryKey: ["progress", targetId],
    queryFn: async () => fetchProgress(targetId),
  });
  const sections = useQuery({
    queryKey: ["targets", targetId, "plan-sections"],
    queryFn: async () => fetchPlanSections(targetId),
  });
  const error = progress.error ?? sections.error;
  return (
    <section className="card readiness" aria-label="Готовность">
      <h3 className="card-title">Готовность</h3>
      {error === null ? null : <p role="alert">Готовность не загрузилась: {error.message}</p>}
      {progress.data === undefined || sections.data === undefined ? null : (
        <ReadinessBody progress={progress.data} sections={sections.data} />
      )}
    </section>
  );
}
