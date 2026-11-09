import type { PlanSection, SessionSummary } from "@/shared/api";

const dateFormat = new Intl.DateTimeFormat("ru-RU", {
  day: "numeric",
  month: "long",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

/** 1 сессия, 2 сессии, 5 сессий. */
export function sessionsWord(count: number): string {
  const tens = count % 100;
  const ones = count % 10;
  if (ones === 1 && tens !== 11) {
    return "сессия";
  }
  return ones >= 2 && ones <= 4 && (tens < 12 || tens > 14) ? "сессии" : "сессий";
}

function averageText(average: number | null): string {
  return average === null ? "без оценок" : `средняя оценка ${average.toLocaleString("ru-RU")}`;
}

/** A Mock interview collapsed into one line: its date, Sections and average Grade. */
export function SessionCardBody({
  session,
  sections,
}: {
  session: SessionSummary;
  sections: readonly PlanSection[];
}) {
  const names = session.sectionIds.map(
    (id) => sections.find((section) => section.id === id)?.name ?? "секция удалена",
  );
  return (
    <>
      <span className="session-date">{dateFormat.format(new Date(session.startedAt))}</span>
      <span className="session-sections">{names.join(", ")}</span>
      <span className="muted">{averageText(session.averageGrade)}</span>
      {session.status === "interrupted" ? <span className="tag">прерван</span> : null}
      {session.status === "running" ? <span className="tag accent">идёт</span> : null}
    </>
  );
}
