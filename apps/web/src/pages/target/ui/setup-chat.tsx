import { useQuery } from "@tanstack/react-query";

import { Chat } from "@/features/agent-chat";
import { openSetupSession } from "@/shared/api";

import { DraftChanges } from "./draft-changes";

/** Opens the Target's running setup session, or a new one, and shows its chat. */
function SetupSession({ targetId }: { targetId: string }) {
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
      renderAboveInput={(view) => <DraftChanges targetId={targetId} status={view.status} />}
    />
  );
}

/**
 * «Настройка цели»: the chat with the Target's setup agent and the draft of changes above its
 * message form. The page places it beside the card where the Candidate opened it; «Скрыть» hides
 * it and the session goes on.
 */
export function SetupChat({ targetId, onClose }: { targetId: string; onClose: () => void }) {
  return (
    <aside className="island setup-chat" aria-labelledby="setup-chat-title">
      <header className="setup-chat-head">
        <h2 id="setup-chat-title">Настройка цели</h2>
        <button type="button" className="ghost" onClick={onClose}>
          Скрыть
        </button>
      </header>
      <SetupSession targetId={targetId} />
    </aside>
  );
}
