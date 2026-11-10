import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { fetchSettings, setFillInBackground } from "@/shared/api";

import { AgentSettings } from "./agent-settings";
import { SpeechRecognitionSettings } from "./speech-recognition";

/** The settings of the whole app, not of one Target. */
export function useSettings() {
  return useQuery({ queryKey: ["settings"], queryFn: fetchSettings });
}

/**
 * «Наполнять в фоне», off by default: with it on, the answer search fills up to 20 Questions by
 * itself after an Inbox processing and after a mock, and spends the agent's subscription.
 */
function AnswerSettings({ enabled }: { enabled: boolean }) {
  const queryClient = useQueryClient();
  const fill = useMutation({
    mutationFn: setFillInBackground,
    onSuccess: (saved) => {
      queryClient.setQueryData(["settings"], saved);
    },
  });
  return (
    <div className="settings-block">
      <label className="settings-switch">
        <input
          type="checkbox"
          aria-label="Наполнять в фоне"
          checked={enabled}
          onChange={() => {
            fill.mutate(!enabled);
          }}
        />
        <span>
          <strong>Наполнять в фоне</strong>
          <span className="hint">
            Поиск опорных ответов сам запускается после разбора материалов и после мока, до 20
            вопросов за раз. Расходует лимиты подписки агента.
          </span>
        </span>
      </label>
      {fill.isError ? <p role="alert">Настройка не сохранена: {fill.error.message}</p> : null}
    </div>
  );
}

const sections = [
  { id: "agents", title: "Агенты" },
  { id: "answers", title: "Опорные ответы" },
  { id: "speech", title: "Распознавание речи" },
] as const;

type SectionId = (typeof sections)[number]["id"];

/** The chosen section of «Настройки». */
function SectionBody({ section }: { section: SectionId }) {
  const settings = useSettings();
  if (section === "speech") {
    return <SpeechRecognitionSettings />;
  }
  if (settings.isError) {
    return <p role="alert">Настройки не загрузились: {settings.error.message}</p>;
  }
  if (settings.data === undefined) {
    return null;
  }
  return section === "agents" ? (
    <AgentSettings settings={settings.data} />
  ) : (
    <AnswerSettings enabled={settings.data.fillInBackground} />
  );
}

/** Closes the window on Escape. */
function useEscape(onClose: () => void) {
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [onClose]);
}

/** The window «Настройки» in the middle of the page: the sections at the left, one open. */
function SettingsDialog({ onClose }: { onClose: () => void }) {
  const [section, setSection] = useState<SectionId>("agents");
  useEscape(onClose);
  return (
    <div className="dialog-backdrop">
      <dialog
        open
        aria-modal="true"
        aria-labelledby="settings-title"
        className="island dialog settings-dialog"
      >
        <header className="settings-head">
          <h2 id="settings-title">Настройки</h2>
          <button type="button" className="ghost" aria-label="Закрыть настройки" onClick={onClose}>
            ✕
          </button>
        </header>
        <div className="settings-layout">
          <nav className="settings-nav" aria-label="Разделы настроек">
            {sections.map(({ id, title }) => (
              <button
                key={id}
                type="button"
                className="ghost"
                aria-current={section === id ? "page" : undefined}
                onClick={() => {
                  setSection(id);
                }}
              >
                {title}
              </button>
            ))}
          </nav>
          <section
            className="settings-section"
            aria-label={sections.find(({ id }) => id === section)?.title}
          >
            <SectionBody section={section} />
          </section>
        </div>
      </dialog>
    </div>
  );
}

/**
 * «Настройки» in the top bar opens the settings window: the agents with their availability, the
 * default agent and each agent's default model and reasoning level; «Наполнять в фоне»; and
 * «Распознавание речи».
 */
export function SettingsMenu() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className="ghost"
        aria-haspopup="dialog"
        onClick={() => {
          setOpen(true);
        }}
      >
        Настройки
      </button>
      {open ? (
        <SettingsDialog
          onClose={() => {
            setOpen(false);
          }}
        />
      ) : null}
    </>
  );
}
