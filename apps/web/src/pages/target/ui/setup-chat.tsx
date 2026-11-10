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
 * How far the open chat reaches beyond the right edge of its zone, in canvas pixels: the chat's
 * 560px and its 32px gap from the card, less the zone frame's 24px padding and 1px border, rounded
 * up. `.setup-chat` and `.zone-frame` in global.css own these sizes; change them together.
 */
export const setupChatOverhang = 568;

/**
 * «Настройка цели»: the chat with the Target's setup agent, and the card «Разбор материалов» and the
 * draft of changes above its message form. The page places it beside the card where the Candidate opened it; «Скрыть» hides
 * it and the session goes on, «Завершить» ends the session.
 */
export function SetupChat({ targetId, onClose }: { targetId: string; onClose: () => void }) {
  return (
    <aside className="island setup-chat nodrag nopan nowheel" aria-labelledby="setup-chat-title">
      <header className="setup-chat-head">
        <h2 id="setup-chat-title">Настройка цели</h2>
        <div className="setup-chat-actions">
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
