import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { fetchSessions } from "@/shared/api";

import { Chat } from "./chat";
import { NewChatForm } from "./new-chat-form";

/** The service chat: a new chat with a chosen agent, or the latest chat with its history. */
export function ServiceChat() {
  const queryClient = useQueryClient();
  const sessions = useQuery({ queryKey: ["sessions"], queryFn: fetchSessions });
  const [startedId, setStartedId] = useState<string | null>(null);
  const latest = sessions.data?.find((session) => session.kind === "service-chat");
  const sessionId = startedId ?? latest?.id ?? null;

  const started = (id: string) => {
    setStartedId(id);
    void queryClient.invalidateQueries({ queryKey: ["sessions"] });
  };
  return (
    <section aria-labelledby="service-chat-title">
      <h2 id="service-chat-title">Служебный чат</h2>
      <NewChatForm onStarted={started} />
      {sessionId === null ? (
        <p>Чатов пока нет. Выберите агента и начните новый чат.</p>
      ) : (
        <Chat key={sessionId} sessionId={sessionId} />
      )}
    </section>
  );
}
