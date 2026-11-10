import { useState } from "react";

import type { ModelId, TranscriptionStatus } from "@/shared/api";

import { sizeText } from "../lib/source-names";
import { useInstallTranscription, useTranscription } from "../model/transcription";

type Available = Extract<TranscriptionStatus, { available: true }>;

/** The models the Candidate ticks; GigaAM for Russian at first. */
function useChosenModels() {
  const [chosen, setChosen] = useState<ReadonlySet<ModelId>>(new Set(["gigaam-v3"]));
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

/** The download's progress bar with the bytes so far. */
function DownloadProgress({
  installation,
}: {
  installation: NonNullable<Available["installation"]>;
}) {
  const { downloaded, total } = installation;
  return (
    <>
      <progress value={downloaded} max={total} aria-label="Загрузка компонентов распознавания" />
      <p className="muted">
        Скачано {sizeText(downloaded)} из {sizeText(total)}. Запустить разбор можно после загрузки.
      </p>
    </>
  );
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
function ModelChoice({ status }: { status: Available }) {
  const install = useInstallTranscription();
  const { chosen, toggle } = useChosenModels();
  const missing = status.models.filter((model) => !model.installed);
  const models = missing.filter((model) => chosen.has(model.id));
  const shared = status.shared.installed ? 0 : status.shared.size;
  const total = models.reduce((sum, model) => sum + model.size, shared);
  return (
    <>
      <ul>
        {missing.map((model) => (
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
function ConsentBody({ status }: { status: Available }) {
  if (status.installation !== null) {
    return <DownloadProgress installation={status.installation} />;
  }
  return (
    <>
      {status.failure === null ? null : (
        <p role="alert">Компоненты не скачались: {status.failure}. Попробуйте ещё раз.</p>
      )}
      <ModelChoice status={status} />
    </>
  );
}

/**
 * Speech recognition in the card «Разбор материалов» when a proposed material is a video or audio
 * and no model is installed: the Candidate chooses GigaAM v3, Parakeet or both and sees the sizes;
 * nothing downloads before «Скачать». Then the progress bar shows the download.
 */
export function TranscriptionConsent() {
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
  const ready = status.shared.installed && status.models.some((model) => model.installed);
  if (ready && status.installation === null) {
    return null;
  }
  return (
    <section className="transcription-consent" aria-label="Распознавание речи">
      <h4>Распознавание речи</h4>
      <p className="muted">
        Среди материалов есть видео. Чтобы получить из него текст, приложение один раз скачает
        компоненты распознавания в свой каталог данных. Видео и звук не покидают устройство.
      </p>
      <ConsentBody status={status} />
    </section>
  );
}
