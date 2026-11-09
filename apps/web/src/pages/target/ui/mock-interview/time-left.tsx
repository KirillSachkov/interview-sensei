import { useNow } from "@/shared/lib";

/** Minutes and seconds, such as «04:07». */
function clock(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  return `${String(minutes).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

/** The time left as it stood when the Mock interview paused; it does not run. */
export function PausedTimeLeft({ leftMs }: { leftMs: number }) {
  return leftMs > 0 ? (
    <span className="time-left" role="timer" aria-label="Осталось времени">
      осталось {clock(leftMs)}
    </span>
  ) : (
    <span className="time-left overtime" role="timer" aria-label="Перерасход времени">
      перерасход +{clock(-leftMs)}
    </span>
  );
}

/**
 * The time left before the limit, then the overtime. The limit only guides the interviewer: the
 * interview ends when the Candidate presses «Завершить».
 */
export function TimeLeft({ endsAt }: { endsAt: string }) {
  const leftMs = Date.parse(endsAt) - useNow();
  return leftMs > 0 ? (
    <span className="time-left" role="timer" aria-label="Осталось времени">
      осталось {clock(leftMs)}
    </span>
  ) : (
    <span className="time-left overtime" role="timer" aria-label="Перерасход времени">
      перерасход +{clock(-leftMs)}
    </span>
  );
}
