import { useMutation } from "@tanstack/react-query";
import { useState } from "react";

import { useSessionEvents } from "@/entities/session";
import { PermissionRequest } from "@/features/agent-chat";
import { deleteSideThread } from "@/shared/api";
import type { ChatEntry, SessionView, SideThread } from "@/shared/api";

import { AgentLine, CandidateLine, ChatForm } from "./chat-parts";
import { FragmentQuote } from "./discuss-separately";
import { useRefreshSideThreads } from "./side-thread-refresh";

/** Where the Side thread opened, as its title says. */
const originTitles = {
  question: "Ветка",
  message: "Ветка из сообщения интервьюера",
  debrief: "Ветка из разбора",
} as const;

/** A line of the Side thread chat; tool calls never reach it, permission requests do. */
function Line({
  entry,
  canAnswer,
  onAnswer,
}: {
  entry: ChatEntry;
  canAnswer: boolean;
  onAnswer: (requestId: string, optionId: string) => void;
}) {
  switch (entry.type) {
    case "candidate_message": {
      return <CandidateLine text={entry.text} />;
    }
    case "agent_message": {
      return <AgentLine text={entry.text} />;
    }
    case "turn_interrupted": {
      return <p className="muted">Ход остановлен.</p>;
    }
    case "turn_failed": {
      return <p role="alert">Агент не смог ответить: {entry.message}</p>;
    }
    case "permission_request": {
      return <PermissionRequest entry={entry} canAnswer={canAnswer} onAnswer={onAnswer} />;
    }
    default: {
      return entry satisfies never;
    }
  }
}

/** What the agent does now, or why the Side thread takes no messages. */
function ThreadState({ view, onCancel }: { view: SessionView; onCancel: () => void }) {
  if (view.failure !== null) {
    return (
      <p role="alert">
        Агент ветки недоступен или упал. Мок идёт дальше; чтобы продолжить разговор, откройте новую
        ветку кнопкой «Обсудить отдельно».
      </p>
    );
  }
  if (view.status === "ended") {
    return <p className="muted">Ветка закрыта и доступна только для чтения.</p>;
  }
  if (view.status === "starting") {
    return (
      <p className="muted" aria-live="polite">
        Агент запускается…
      </p>
    );
  }
  return view.status === "working" ? (
    <p className="muted" aria-live="polite">
      Агент работает…{" "}
      <button type="button" className="ghost" onClick={onCancel}>
        Остановить
      </button>
    </p>
  ) : null;
}

/** ✕ asks first: «Удалить» deletes the Side thread and its chat for good. */
function DeleteThread({ thread }: { thread: SideThread }) {
  const [asking, setAsking] = useState(false);
  const refresh = useRefreshSideThreads(thread.interviewId);
  const deletion = useMutation({
    mutationFn: async () => deleteSideThread(thread),
    onSuccess: refresh,
  });
  if (!asking) {
    return (
      <button
        type="button"
        className="ghost side-thread-close"
        aria-label="Удалить ветку"
        title="Удалить ветку"
        onClick={() => {
          setAsking(true);
        }}
      >
        ✕
      </button>
    );
  }
  return (
    <div className="side-thread-confirm" role="alertdialog" aria-label="Удалить ветку?">
      <p>Удалить ветку навсегда? Переписка удалится; пометка «с подсказкой» у вопроса останется.</p>
      <div className="answer-actions">
        <button
          type="button"
          className="danger"
          disabled={deletion.isPending}
          onClick={() => {
            deletion.mutate();
          }}
        >
          Удалить
        </button>
        <button
          type="button"
          className="ghost"
          onClick={() => {
            setAsking(false);
          }}
        >
          Отмена
        </button>
      </div>
      {deletion.isError ? <p role="alert">Ветка не удалилась: {deletion.error.message}</p> : null}
    </div>
  );
}

/**
 * A Side thread to the right of its question (#80): a chat with the same agent as the mock
 * interview, which explains. The reply comes in chunks; «Остановить» ends the agent's turn, and ✕
 * deletes the thread.
 */
export function SideThreadChat({ thread, number }: { thread: SideThread; number: number }) {
  const { view, notice, lost, prompt, cancel, answerPermission } = useSessionEvents(
    thread.sessionId,
  );
  const status = lost === null ? (view?.status ?? null) : null;
  return (
    <aside className="side-thread" aria-label={`Ветка к вопросу ${number}`}>
      <header className="side-thread-head">
        <h4>{originTitles[thread.origin.kind]}</h4>
        <DeleteThread thread={thread} />
      </header>
      <FragmentQuote fragment={thread.fragment} />
      {thread.question === null ? null : <CandidateLine text={thread.question} />}
      <ol className="interviewer-lines nowheel" aria-label="Сообщения ветки">
        {(view?.entries ?? []).map((entry) => (
          <li key={entry.id}>
            <Line entry={entry} canAnswer={status === "working"} onAnswer={answerPermission} />
          </li>
        ))}
      </ol>
      {view === null ? null : <ThreadState view={view} onCancel={cancel} />}
      {lost === null ? null : <p role="alert">{lost}</p>}
      {notice === null ? null : <output>{notice}</output>}
      <ChatForm
        status={status}
        onSend={prompt}
        label="Сообщение в ветку"
        placeholder="Спросить ещё"
      />
    </aside>
  );
}
