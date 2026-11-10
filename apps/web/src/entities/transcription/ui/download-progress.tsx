import type { TranscriptionStatus } from "@/shared/api";
import { sizeText } from "@/shared/lib";

type Installation = NonNullable<Extract<TranscriptionStatus, { available: true }>["installation"]>;

/** The download's progress bar with the bytes so far and what the Candidate waits for. */
export function DownloadProgress({
  installation,
  note,
}: {
  installation: Installation;
  /** Such as «Запустить разбор можно после загрузки.» */
  note?: string;
}) {
  const { downloaded, total } = installation;
  return (
    <>
      <progress value={downloaded} max={total} aria-label="Загрузка компонентов распознавания" />
      <p className="muted">
        Скачано {sizeText(downloaded)} из {sizeText(total)}.{note === undefined ? null : ` ${note}`}
      </p>
    </>
  );
}
