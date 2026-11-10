import { useState } from "react";

import {
  DownloadProgress,
  useInstallTranscription,
  useTranscription,
} from "@/entities/transcription";
import type { ModelId, TranscriptionStatus } from "@/shared/api";

import { sizeText } from "../lib/source-names";

type Available = Extract<TranscriptionStatus, { available: true }>;

/** The models the Candidate ticks: the ones the chosen recordings miss at first. */
function useChosenModels(missing: ReadonlySet<ModelId>) {
  const [chosen, setChosen] = useState<ReadonlySet<ModelId>>(
    missing.size === 0 ? new Set(["gigaam-v3"]) : missing,
  );
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

/** The models with their sizes, the size of the shared components and «Скачать». */
function ModelChoice({ status, missing }: { status: Available; missing: ReadonlySet<ModelId> }) {
  const install = useInstallTranscription();
  const { chosen, toggle } = useChosenModels(missing);
  const offered = status.models.filter((model) => !model.installed);
  const models = offered.filter((model) => chosen.has(model.id));
  const shared = status.shared.installed ? 0 : status.shared.size;
  const total = models.reduce((sum, model) => sum + model.size, shared);
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
      {shared === 0 ? null : (
        <p className="muted">
          Вместе с моделью: движок sherpa-onnx, ffmpeg и Silero VAD — {sizeText(shared)}.
        </p>
      )}
      {install.error === null ? null : (
        <p role="alert">Загрузка не началась: {install.error.message}</p>
      )}
      <button
        type="button"
        disabled={models.length === 0 || install.isPending}
        onClick={() => {
          install.mutate(models.map((model) => model.id));
        }}
      >
        Скачать {sizeText(total)}
      </button>
    </>
  );
}

/** What the block shows for the state of recognition. */
function ConsentBody({ status, missing }: { status: Available; missing: ReadonlySet<ModelId> }) {
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
      <ModelChoice status={status} missing={missing} />
      <p className="muted">
        Без загрузки такие видео получат «ошибку». Вместо загрузки можно приложить транскрипт с тем
        же именем файла, например «interview.vtt» к «interview.mp4».
      </p>
    </>
  );
}

/**
 * Speech recognition in the card «Разбор материалов» when a chosen video or audio has no installed
 * model for its language: the Candidate chooses GigaAM v3, Parakeet or both and sees the sizes;
 * nothing downloads before «Скачать». Then the progress bar shows the download. `missing` has the
 * models the chosen recordings miss; they are ticked at first.
 */
export function TranscriptionConsent({ missing }: { missing: ReadonlySet<ModelId> }) {
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
  if (missing.size === 0 && status.installation === null) {
    return null;
  }
  return (
    <section className="transcription-consent" aria-label="Распознавание речи">
      <h4>Распознавание речи</h4>
      <p className="muted">
        Среди материалов есть видео. Чтобы получить из него текст, приложение один раз скачает
        компоненты распознавания в свой каталог данных. Видео и звук не покидают устройство.
      </p>
      <ConsentBody status={status} missing={missing} />
    </section>
  );
}
