import type { TargetView } from "@/shared/api";

import { activeInterview, useLatestInterviews } from "../model/latest-interviews";
import { StartMock } from "./mock-interview/start-form";

/**
 * The tile «Мок-собеседование» of the «Цель» zone: the big button that opens the window of a new
 * Mock interview. A started one appears in the «Сессии» zone, and the canvas moves there. The
 * button waits for the plan of a draft Target, and while a Mock interview runs it says where.
 */
export function StartTile({ target }: { target: TargetView }) {
  const { latest, refresh, started } = useLatestInterviews(target.id);
  const active = activeInterview(latest.data);
  return (
    <section className="card start-tile" aria-label="Мок-собеседование">
      <h3 className="card-title">Мок-собеседование</h3>
      <p className="muted">Агент задаёт вопросы по плану, оценивает ответы и разбирает их.</p>
      {target.status === "draft" ? (
        <p className="hint">Сначала соберите цель с агентом в чате.</p>
      ) : null}
      {active?.status === "running" ? (
        <p className="hint">Мок уже идёт: он в зоне «Сессии» справа.</p>
      ) : null}
      {target.status === "draft" || active?.status === "running" ? null : (
        <StartMock
          targetId={target.id}
          difficulty={latest.data?.[0]?.difficulty ?? "as_is"}
          paused={active}
          onFinished={refresh}
          onStarted={started}
        />
      )}
    </section>
  );
}
