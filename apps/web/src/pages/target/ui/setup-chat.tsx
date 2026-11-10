import { useState } from "react";

import { isLargest } from "../model/chat-size";
import type { ChatSize } from "../model/chat-size";
import { ChatResizeHandle } from "./chat-resize";
import { FinishSetup } from "./finish-setup";
import { SetupBody } from "./setup-session";
import type { Engagement } from "./setup-session";

/** A button of the chat's head that shows only an icon; `label` names it for everyone. */
function IconButton({
  label,
  path,
  onClick,
}: {
  label: string;
  /** The `d` of the icon's outline in a 20 by 20 box. */
  path: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="ghost icon-button"
      aria-label={label}
      title={label}
      onClick={onClick}
    >
      <svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true">
        <path
          d={path}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}

const icons = {
  enlarge: "M12 3h5v5M8 17H3v-5M17 3l-6 6M3 17l6-6",
  reduce: "M8 3v5H3M12 17v-5h5M8 8 3 3M12 12l5 5",
  hide: "M5 5l10 10M15 5 5 15",
} as const;

export interface SetupChatProps {
  readonly targetId: string;
  /** A draft Target starts its onboarding at once: the agent speaks first. */
  readonly draft: boolean;
  readonly size: ChatSize;
  readonly onResize: (size: ChatSize) => void;
  /** «Развернуть» or «Свернуть»: the largest size, or back to the default one. */
  readonly onToggleSize: () => void;
  readonly onClose: () => void;
}

/**
 * «Настройка цели»: the chat with the Target's setup agent in the middle of the «Цель» zone, with
 * the card «Разбор материалов» and the draft of changes above its message box. It stands open; its
 * agent starts with the Candidate's first message, or at once for a draft Target. The corner
 * resizes it, «Развернуть» makes it the largest, «Скрыть» hides it and the session goes on,
 * «Завершить» ends the session.
 */
export function SetupChat({
  targetId,
  draft,
  size,
  onResize,
  onToggleSize,
  onClose,
}: SetupChatProps) {
  const [engagement, setEngagement] = useState<Engagement>("follow");
  const largest = isLargest(size);
  return (
    <aside
      className="card setup-chat nodrag nopan"
      aria-labelledby="setup-chat-title"
      style={{ height: size.height }}
    >
      <header className="setup-chat-head">
        <h2 id="setup-chat-title">Настройка цели</h2>
        <div className="setup-chat-actions">
          <IconButton
            label={largest ? "Свернуть" : "Развернуть"}
            path={largest ? icons.reduce : icons.enlarge}
            onClick={onToggleSize}
          />
          <FinishSetup
            targetId={targetId}
            onFinished={() => {
              setEngagement("waiting");
            }}
          />
          <IconButton label="Скрыть" path={icons.hide} onClick={onClose} />
        </div>
      </header>
      <SetupBody
        targetId={targetId}
        draft={draft}
        engagement={engagement}
        onFirst={(first) => {
          setEngagement({ first });
        }}
      />
      <ChatResizeHandle size={size} onResize={onResize} />
    </aside>
  );
}

/** The hidden setup chat: what the chat is for, and the button that shows it again. */
export function SetupInvite({ onOpen }: { onOpen: () => void }) {
  return (
    <section className="card setup-invite" aria-label="Чат настройки">
      <h3 className="card-title">Чат с агентом настройки</h3>
      <p className="muted">
        Агент меняет план, темы и вопросы, принимает вакансию, резюме и другие материалы. Все правки
        вы применяете сами.
      </p>
      <button type="button" className="primary" onClick={onOpen}>
        Открыть чат
      </button>
    </section>
  );
}
