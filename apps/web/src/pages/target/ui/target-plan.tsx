import type { PlanSection, TargetView } from "@/shared/api";

const kindNames: Record<PlanSection["kind"], string> = {
  conversation: "разговор",
  topics: "вопросы по темам",
  design: "проектирование",
};

function SectionBlock({ section, number }: { section: PlanSection; number: number }) {
  return (
    <li className={`plan-section plan-${section.kind}`}>
      <div className="plan-head">
        <span className="plan-number">{number}</span>
        <span className="plan-name">{section.name}</span>
        <span className="tag">{kindNames[section.kind]}</span>
        {section.enabled ? null : <span className="tag">выключена</span>}
      </div>
      {section.topics.length === 0 ? null : (
        <ul className="plan-topics" aria-label="Темы">
          {section.topics.map((topic) => (
            <li key={topic.id} className="tag">
              {topic.name}
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

/** The Target's Interview plan in the «Цель» zone: numbered Sections with their kind and Topics. */
export function TargetPlan({ target }: { target: TargetView }) {
  if (target.sections.length === 0) {
    return <p className="muted">Плана пока нет: его соберёт агент в чате настройки.</p>;
  }
  return (
    <ol className="plan" aria-label="План собеседования">
      {target.sections.map((section, index) => (
        <SectionBlock key={section.id} section={section} number={index + 1} />
      ))}
    </ol>
  );
}
