import {
  DownloadProgress,
  useInstallTranscription,
  useRemoveTranscriptionModel,
  useTranscription,
} from "@/entities/transcription";
import type { AvailableTranscription as Available, TranscriptionStatus } from "@/shared/api";
import { sizeText } from "@/shared/lib";

type Model = Available["models"][number];

/** One model: its languages, size and status, with «Установить», «Доустановить» or «Удалить». */
function ModelRow({
  model,
  status,
  busy,
  onInstall,
  onRemove,
}: {
  model: Model;
  status: Available;
  busy: boolean;
  onInstall: () => void;
  onRemove: () => void;
}) {
  const another = status.models.some((other) => other.id !== model.id && other.installed);
  return (
    <li className="speech-model">
      <span className="speech-model-text">
        <span>{model.name}</span>
        <span className="muted">
          {model.languages}, {sizeText(model.size)} —{" "}
          {model.installed ? "установлена" : "не установлена"}
        </span>
      </span>
      {model.installed ? (
        <button
          type="button"
          className="ghost"
          aria-label={`Удалить ${model.name}`}
          disabled={busy}
          onClick={onRemove}
        >
          Удалить
        </button>
      ) : (
        <button
          type="button"
          aria-label={`${another ? "Доустановить" : "Установить"} ${model.name}`}
          disabled={busy}
          onClick={onInstall}
        >
          {another ? "Доустановить" : "Установить"}
        </button>
      )}
    </li>
  );
}

/**
 * yt-dlp for links to videos: it comes with any model, and «Установить» downloads it alone, so links
 * with manual subtitles are read without a model.
 */
function YtDlpRow({
  status,
  busy,
  onInstall,
}: {
  status: Available;
  busy: boolean;
  onInstall: () => void;
}) {
  return (
    <li className="speech-model">
      <span className="speech-model-text">
        <span>yt-dlp</span>
        <span className="muted">
          ссылки на видео: субтитры и звук, {sizeText(status.ytDlp.size)} —{" "}
          {status.ytDlp.installed ? "установлен" : "не установлен"}
        </span>
      </span>
      {status.ytDlp.installed ? null : (
        <button type="button" aria-label="Установить yt-dlp" disabled={busy} onClick={onInstall}>
          Установить
        </button>
      )}
    </li>
  );
}

/** The models, yt-dlp, the shared components, the running download and why an action failed. */
function RecognitionBody({ status }: { status: Available }) {
  const install = useInstallTranscription();
  const remove = useRemoveTranscriptionModel();
  const busy = status.installation !== null || install.isPending || remove.isPending;
  const error = install.error ?? remove.error;
  return (
    <>
      <ul className="speech-models">
        {status.models.map((model) => (
          <ModelRow
            key={model.id}
            model={model}
            status={status}
            busy={busy}
            onInstall={() => {
              install.mutate([model.id]);
            }}
            onRemove={() => {
              remove.mutate(model.id);
            }}
          />
        ))}
        <YtDlpRow
          status={status}
          busy={busy}
          onInstall={() => {
            install.mutate([]);
          }}
        />
      </ul>
      <p className="muted">
        Движок sherpa-onnx, ffmpeg и Silero VAD — {sizeText(status.shared.size)}:{" "}
        {status.shared.installed ? "установлены" : "скачаются вместе с первой моделью"}.
      </p>
      {status.installation === null ? null : (
        <DownloadProgress installation={status.installation} />
      )}
      {status.failure === null ? null : (
        <p role="alert">Компоненты не скачались: {status.failure}. Попробуйте ещё раз.</p>
      )}
      {error === null ? null : <p role="alert">Не получилось: {error.message}</p>}
    </>
  );
}

/** The state of recognition once the server answered. */
function RecognitionState({ status }: { status: TranscriptionStatus }) {
  if (!status.available) {
    return (
      <p>Распознавание речи не работает на этой платформе: прикладывайте к видео транскрипт.</p>
    );
  }
  return <RecognitionBody status={status} />;
}

/**
 * «Распознавание речи» in «Настройки»: the status of each model with its install, its install
 * beside the other model, and its deletion, which frees the disk space. Components download into
 * the application's data directory only on the Candidate's button.
 */
export function SpeechRecognitionSettings() {
  const { data: status, error } = useTranscription();
  return (
    <div className="speech-recognition">
      <p className="muted">
        Приложение распознаёт речь видео и аудио на этом устройстве: GigaAM v3 — русскую речь,
        Parakeet — 25 европейских языков. При обеих моделях русская речь идёт в GigaAM. yt-dlp
        читает ссылки на видео: без модели они разбираются по ручным субтитрам. Компоненты лежат в
        каталоге данных приложения, видео и звук не покидают устройство.
      </p>
      {error === null ? null : <p role="alert">Состояние не загрузилось: {error.message}</p>}
      {status === undefined ? null : <RecognitionState status={status} />}
    </div>
  );
}
