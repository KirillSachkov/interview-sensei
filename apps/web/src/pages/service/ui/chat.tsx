import { useState } from "react";
import type { SubmitEvent } from "react";

import type { SessionView } from "@/shared/api";

import { useSessionEvents } from "../model/use-session-events";
import { agentName } from "./agent-names";
import { ChatEntries } from "./chat-entries";

function failureText(failure: NonNullable<SessionView["failure"]>): string {
  if (failure.reason === "agent_not_started") {
    return `Агент не запустился: ${failure.message}. Начните новый чат.`;
  }
  const how = failure.exitCode === null ? `сигнал ${failure.signal}` : `код ${failure.exitCode}`;
  return `Процесс агента завершился с ошибкой (${how}). Начните новый чат.`;
}

/** What the agent does now, or why the chat takes no messages. */
function SessionState({ view, onCancel }: { view: SessionView; onCancel: () => void }) {
  if (view.failure !== null) {
    return <p role="alert">{failureText(view.failure)}</p>;
  }
  if (view.status === "ended") {
    return <p>Чат закрыт: сервер перезапускался. Начните новый чат, чтобы продолжить.</p>;
  }
  if (view.status === "starting") {
    return <p aria-live="polite">Агент запускается…</p>;
  }
  if (view.status === "working") {
    return (
      <p aria-live="polite">
        Агент работает…{" "}
        <button type="button" onClick={onCancel}>
          Остановить
        </button>
      </p>
    );
  }
  return null;
}

function MessageForm({ enabled, onSend }: { enabled: boolean; onSend: (text: string) => void }) {
  const [text, setText] = useState("");
  const submit = (event: SubmitEvent) => {
    event.preventDefault();
    if (text.trim() !== "") {
      onSend(text);
      setText("");
    }
  };
  return (
    <form onSubmit={submit}>
      <label>
        Сообщение{" "}
        <input
          value={text}
          onChange={(event) => {
            setText(event.target.value);
          }}
        />
      </label>{" "}
      <button type="submit" disabled={!enabled || text.trim() === ""}>
        Отправить
      </button>
    </form>
  );
}

/** The service chat with one agent: messages, agent state and the message form. */
export function Chat({ sessionId }: { sessionId: string }) {
  const { view, prompt, cancel } = useSessionEvents(sessionId);
  if (view === null) {
    return <p>Загружаем чат…</p>;
  }
  return (
    <section aria-label={`Чат с агентом «${agentName(view.agent)}»`}>
      <p>Агент: {agentName(view.agent)}</p>
      <ChatEntries entries={view.entries} />
      <SessionState view={view} onCancel={cancel} />
      <MessageForm enabled={view.status === "idle"} onSend={prompt} />
    </section>
  );
}
