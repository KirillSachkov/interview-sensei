import { useQuery } from "@tanstack/react-query";

import { Chat, Composer } from "@/features/agent-chat";
import { fetchSessions, openSetupSession } from "@/shared/api";

import { useSourceAttachments, useSourcesAfterTurn } from "../model/source-attachments";
import { turnEnd } from "../model/turn-end";
import { DraftChanges } from "./draft-changes";
import { InboxProposal } from "./inbox-proposal";

/** Follows the agent's turns for the materials; shows nothing. */
function SourcesFollower({ targetId, turn }: { targetId: string; turn: number | null }) {
  useSourcesAfterTurn(targetId, turn);
  return null;
}

/**
 * Opens the Target's running setup session, or a new one, and shows its chat. `firstMessage` is
 * the message the Candidate wrote before the session started: the agent gets it once it waits.
 */
function SetupSession({ targetId, firstMessage }: { targetId: string; firstMessage?: string }) {
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
      firstMessage={firstMessage}
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
 * The chat before its agent starts: the draft of changes and the message box. The first message
 * starts the setup session, so an open chat spends no subscription until the Candidate writes.
 */
function WaitingChat({ targetId, onSend }: { targetId: string; onSend: (text: string) => void }) {
  const attachments = useSourceAttachments(targetId);
  return (
    <section className="chat" aria-label="Чат с агентом настройки">
      <div className="chat-empty">
        <p>Напишите агенту, что изменить в цели.</p>
        <p className="muted">
          Он меняет план, темы и вопросы, принимает вакансию, резюме и другие материалы. Агент
          запустится с вашим первым сообщением.
        </p>
      </div>
      <InboxProposal targetId={targetId} turn={null} />
      <DraftChanges targetId={targetId} turn={null} />
      <Composer
        status="idle"
        onSend={onSend}
        label="Сообщение"
        placeholder="Напишите агенту"
        attachments={attachments}
      />
    </section>
  );
}

/** Whether the Target has a setup session whose agent is alive now. */
function useLiveSetup(targetId: string) {
  return useQuery({
    queryKey: ["targets", targetId, "live-setup"],
    queryFn: async () => {
      const sessions = await fetchSessions();
      return sessions.some(
        (session) =>
          session.kind === "target-setup" &&
          session.targetId === targetId &&
          (session.status === "starting" ||
            session.status === "idle" ||
            session.status === "working"),
      );
    },
    refetchOnWindowFocus: false,
  });
}

/**
 * What the chat shows. `follow`: the running session, if the Target has one, or the onboarding of
 * a draft Target. `waiting`: the message box without a session, after «Завершить». A string: the
 * Candidate's first message, which starts the session.
 */
export type Engagement = "follow" | "waiting" | { readonly first: string };

export function SetupBody({
  targetId,
  draft,
  engagement,
  onFirst,
}: {
  targetId: string;
  draft: boolean;
  engagement: Engagement;
  onFirst: (text: string) => void;
}) {
  const live = useLiveSetup(targetId);
  if (typeof engagement === "object") {
    return <SetupSession targetId={targetId} firstMessage={engagement.first} />;
  }
  if (engagement === "follow" && live.data === undefined && !draft) {
    return <p className="muted">Открываем чат настройки…</p>;
  }
  return engagement === "follow" && (draft || live.data === true) ? (
    <SetupSession targetId={targetId} />
  ) : (
    <WaitingChat targetId={targetId} onSend={onFirst} />
  );
}
