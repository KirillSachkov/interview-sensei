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

/** The colour of the average Grade on the 0–3 scale: strong from 2.5, middling from 1.5. */
function gradeTone(average: number): "good" | "middle" | "weak" {
  if (average >= 2.5) {
    return "good";
  }
  return average >= 1.5 ? "middle" : "weak";
}

/** The average Grade with a dot of its colour, and how many questions got an answer. */
function SessionResult({ session }: { session: SessionSummary }) {
  return (
    <span className="session-result muted">
      {session.averageGrade === null ? null : (
        <span className={`grade-dot ${gradeTone(session.averageGrade)}`} aria-hidden="true" />
      )}
      {averageText(session.averageGrade)} · ответов {session.answeredCount} из{" "}
      {session.questionCount}
    </span>
  );
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
      <SessionResult session={session} />
      {session.status === "interrupted" ? <span className="tag">прерван</span> : null}
      {session.status === "running" ? <span className="tag accent">идёт</span> : null}
      {session.status === "paused" ? <span className="tag accent">на паузе</span> : null}
    </>
  );
}
