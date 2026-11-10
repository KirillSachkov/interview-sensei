import { useQuery } from "@tanstack/react-query";

import { Chat } from "@/features/agent-chat";
import { openSetupSession } from "@/shared/api";

import { useSourceAttachments, useSourcesAfterTurn } from "../model/source-attachments";
import { turnEnd } from "../model/turn-end";
import { DraftChanges } from "./draft-changes";
import { FinishSetup } from "./finish-setup";
import { InboxProposal } from "./inbox-proposal";

/** Follows the agent's turns for the materials; shows nothing. */
function SourcesFollower({ targetId, turn }: { targetId: string; turn: number | null }) {
  useSourcesAfterTurn(targetId, turn);
  return null;
}

/** Opens the Target's running setup session, or a new one, and shows its chat. */
function SetupSession({ targetId }: { targetId: string }) {
  const attachments = useSourceAttachments(targetId);
  const session = useQuery({
    queryKey: ["targets", targetId, "setup-session"],
    queryFn: async () => openSetupSession(targetId),
    retry: false,
    refetchOnWindowFocus: false,
  });
  if (session.isError) {
    return <p role="alert">Чат настройки не открылся: {session.error.message}</p>;
  }
  if (session.data === undefined) {
    return <p>Открываем чат настройки…</p>;
  }
  return (
    <Chat
      key={session.data.id}
      sessionId={session.data.id}
      renderAboveInput={(view) => {
        const turn = turnEnd(view);
        return (
          <>
            <SourcesFollower targetId={targetId} turn={turn} />
            <InboxProposal targetId={targetId} turn={turn} />
            <DraftChanges targetId={targetId} turn={turn} />
          </>
        );
      }}
      attachments={attachments}
    />
  );
}

/**
 * «Настройка цели»: the chat with the Target's setup agent in the middle of the «Цель» zone, with
 * the card «Разбор материалов» and the draft of changes above its message box. «Развернуть» makes
 * it larger, «Скрыть» hides it and the session goes on, «Завершить» ends the session.
 */
export function SetupChat({
  targetId,
  large,
  onResize,
  onClose,
}: {
  targetId: string;
  large: boolean;
  onResize: () => void;
  onClose: () => void;
}) {
  return (
    <aside
      className={`card setup-chat nodrag nopan${large ? " setup-chat-large" : ""}`}
      aria-labelledby="setup-chat-title"
    >
      <header className="setup-chat-head">
        <h2 id="setup-chat-title">Настройка цели</h2>
        <div className="setup-chat-actions">
          <button type="button" className="ghost" onClick={onResize}>
            {large ? "Свернуть" : "Развернуть"}
          </button>
          <FinishSetup targetId={targetId} onFinished={onClose} />
          <button type="button" className="ghost" onClick={onClose}>
            Скрыть
          </button>
        </div>
      </header>
      <SetupSession targetId={targetId} />
    </aside>
  );
}

/** The closed setup chat: what the chat is for, and the button that opens it. */
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
