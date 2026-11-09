import type { TargetSummary } from "@/shared/api";

const levelNames = { junior: "Junior", middle: "Middle", senior: "Senior" } as const;

/** The Target's name and level at the top of the «Цель» zone. */
export function TargetCard({ target }: { target: TargetSummary }) {
  return (
    <article className="card" aria-label="Название и уровень">
      <h3 className="card-title">{target.name === "" ? "Цель без названия" : target.name}</h3>
      <p className="muted">
        Уровень:{" "}
        <span className="tag accent">
          {target.level === null ? "не задан" : levelNames[target.level]}
        </span>
      </p>
    </article>
  );
}
