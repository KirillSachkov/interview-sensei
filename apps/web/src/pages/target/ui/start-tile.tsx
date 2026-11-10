import { useQuery } from "@tanstack/react-query";

import { fetchLatestInterviews } from "@/shared/api";
import type { TargetView } from "@/shared/api";

/** Why the Mock interview cannot start now, or what the button does; null when it just starts. */
function startHint(target: TargetView, current: "running" | "paused" | null): string | null {
  if (current === "running") {
    return "Мок уже идёт: он в зоне «Сессии» справа.";
  }
  if (current === "paused") {
    return "Есть мок на паузе: продолжите его или завершите.";
  }
  if (target.status === "draft") {
    return "Сначала соберите цель с агентом в чате.";
  }
  return target.sections.some((section) => section.enabled)
    ? null
    : "В плане нет включённых секций: включите хотя бы одну.";
}

/**
 * The tile «Мок-собеседование» of the «Цель» zone: the big button that shows the «Сессии» zone
 * and opens its start dialog. It is off for a draft Target, without enabled Sections and while a
 * Mock interview runs, and says why.
 */
export function StartTile({ target, onStart }: { target: TargetView; onStart: () => void }) {
  const latest = useQuery({
    queryKey: ["targets", target.id, "interviews"],
    queryFn: async () => fetchLatestInterviews(target.id),
  });
  const status = latest.data?.[0]?.status;
  const current = status === "running" || status === "paused" ? status : null;
  const hint = startHint(target, current);
  return (
    <section className="card start-tile" aria-label="Мок-собеседование">
      <h3 className="card-title">Мок-собеседование</h3>
      <p className="muted">Агент задаёт вопросы по плану, оценивает ответы и разбирает их.</p>
      <button
        type="button"
        className="primary big"
        disabled={hint !== null && current !== "paused"}
        onClick={onStart}
      >
        Начать мок-собеседование
      </button>
      {hint === null ? null : <p className="hint">{hint}</p>}
    </section>
  );
}
