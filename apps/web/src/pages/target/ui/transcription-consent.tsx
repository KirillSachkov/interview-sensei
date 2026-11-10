import { useState } from "react";

import {
  DownloadProgress,
  useInstallTranscription,
  useTranscription,
} from "@/entities/transcription";
import type { AvailableTranscription as Available, ModelId } from "@/shared/api";
import { sizeText } from "@/shared/lib";

import type { Needs } from "../model/card-choice";

/** The models the Candidate ticks: the ones the chosen files miss at first. */
function useChosenModels(missing: ReadonlySet<ModelId>) {
  const [chosen, setChosen] = useState<ReadonlySet<ModelId>>(missing);
  const toggle = (id: ModelId, checked: boolean) => {
    const next = new Set(chosen);
    if (checked) {
      next.add(id);
    } else {
      next.delete(id);
    }
    setChosen(next);
  };
  return { chosen, toggle };
}

/** One model with its languages and size, ticked to download it. */
function ModelOption({
  model,
  checked,
  disabled,
  onToggle,
}: {
  model: Available["models"][number];
  checked: boolean;
  disabled: boolean;
  onToggle: (checked: boolean) => void;
}) {
  return (
    <li>
      <label>
        <input
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={(event) => {
            onToggle(event.target.checked);
          }}
        />
        <span>
          {model.name}{" "}
          <span className="muted">
            — {model.languages}, {sizeText(model.size)}
          </span>
        </span>
      </label>
    </li>
  );
}

/** The bytes «Скачать» downloads: with a model, the shared components and yt-dlp too. */
function downloadSize(status: Available, models: readonly Available["models"][number][]) {
  const ytDlp = status.ytDlp.installed ? 0 : status.ytDlp.size;
  if (models.length === 0) {
    return { shared: 0, total: ytDlp };
  }
  const shared = (status.shared.installed ? 0 : status.shared.size) + ytDlp;
  return { shared, total: models.reduce((sum, model) => sum + model.size, shared) };
}

/** What the download brings besides the ticked models. */
function DownloadNote({ shared, onlyYtDlp }: { shared: number; onlyYtDlp: number | null }) {
  if (onlyYtDlp !== null) {
    return (
      <p className="muted">
        Без модели скачается только yt-dlp — {sizeText(onlyYtDlp)}. Ссылки на видео с ручными
        субтитрами разберутся, видео без субтитров получат «ошибку».
      </p>
    );
  }
  return shared === 0 ? null : (
    <p className="muted">
      Вместе с моделью: движок sherpa-onnx, ffmpeg, Silero VAD и yt-dlp для ссылок на видео —{" "}
      {sizeText(shared)}.
    </p>
  );
}

/**
 * The models with their sizes, the size of the shared components and «Скачать». With a chosen
 * link and no ticked model, «Скачать» downloads only yt-dlp for the link's subtitles.
 */
function ModelChoice({ status, needs }: { status: Available; needs: Needs }) {
  const install = useInstallTranscription();
  const { chosen, toggle } = useChosenModels(needs.missing);
  const offered = status.models.filter((model) => !model.installed);
  const models = offered.filter((model) => chosen.has(model.id));
  const { shared, total } = downloadSize(status, models);
  const onlyYtDlp = models.length === 0 && needs.links ? total : null;
  return (
    <>
      <ul>
        {offered.map((model) => (
          <ModelOption
            key={model.id}
            model={model}
            checked={chosen.has(model.id)}
            disabled={install.isPending}
            onToggle={(checked) => {
              toggle(model.id, checked);
            }}
          />
        ))}
      </ul>
      <DownloadNote shared={shared} onlyYtDlp={onlyYtDlp} />
      {install.error === null ? null : (
        <p role="alert">Загрузка не началась: {install.error.message}</p>
      )}
      <button
        type="button"
        disabled={(models.length === 0 && onlyYtDlp === null) || install.isPending}
        onClick={() => {
          install.mutate(models.map((model) => model.id));
        }}
      >
        {onlyYtDlp === null
          ? `Скачать ${sizeText(total)}`
          : `Скачать только yt-dlp для субтитров, ${sizeText(total)}`}
      </button>
    </>
  );
}

/** What the block shows for the state of recognition. */
function ConsentBody({ status, needs }: { status: Available; needs: Needs }) {
  if (status.installation !== null) {
    return (
      <DownloadProgress
        installation={status.installation}
        note="Запустить разбор можно после загрузки."
      />
    );
  }
  return (
    <>
      {status.failure === null ? null : (
        <p role="alert">Компоненты не скачались: {status.failure}. Попробуйте ещё раз.</p>
      )}
      <ModelChoice status={status} needs={needs} />
      <p className="muted">
        Без загрузки такие видео получат «ошибку», остальные материалы разберутся. Вместо загрузки
        можно приложить транскрипт с тем же именем файла, например «interview.vtt» к
        «interview.mp4».
      </p>
    </>
  );
}

/** Why the chosen materials need the download, in the words of the card. */
function Reason({ needs }: { needs: Needs }) {
  return (
    <p className="muted">
      {needs.missing.size > 0
        ? "Среди материалов есть видео. Чтобы получить из него текст, приложение один раз скачает компоненты распознавания в свой каталог данных."
        : "Среди материалов есть ссылки на видео. Их субтитры и звук приложение получает через yt-dlp: его нужно один раз скачать в каталог данных."}{" "}
      {needs.links
        ? "Язык речи ссылки приложение узнает из данных видео: для видео без субтитров нужна модель этого языка."
        : null}{" "}
      Видео и звук не покидают устройство.
    </p>
  );
}

/**
 * Speech recognition in the card «Разбор материалов» when a chosen file has no installed model for
 * its language, or a chosen link to a video needs yt-dlp: the Candidate chooses GigaAM v3, Parakeet,
 * both or none, and sees the sizes; nothing downloads before «Скачать». Then the progress bar shows
 * the download. The models the chosen files miss are ticked at first; a link ticks none, because its
 * language comes from the video.
 */
export function TranscriptionConsent({ needs }: { needs: Needs }) {
  const { data: status } = useTranscription();
  if (status === undefined) {
    return null;
  }
  if (!status.available) {
    return (
      <p className="muted">
        Распознавание речи не работает на этой платформе: приложите к видео его транскрипт.
      </p>
    );
  }
  if (needs.missing.size === 0 && !needs.links && status.installation === null) {
    return null;
  }
  return (
    <section className="transcription-consent" aria-label="Распознавание речи">
      <h4>Распознавание речи</h4>
      <Reason needs={needs} />
      <ConsentBody status={status} needs={needs} />
    </section>
  );
}
