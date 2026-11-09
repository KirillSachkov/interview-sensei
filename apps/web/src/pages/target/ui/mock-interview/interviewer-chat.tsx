import { useSessionEvents } from "@/entities/session";
import type { ChatEntry } from "@/shared/api";

import { AgentLine, CandidateLine, ChatForm } from "./chat-parts";
import { DiscussSeparately } from "./discuss-separately";

/**
 * A line of the interviewer chat; tool calls never reach it. An interviewer message has
 * «Обсудить отдельно».
 */
function Line({ entry, interviewId }: { entry: ChatEntry; interviewId: string }) {
  switch (entry.type) {
    case "candidate_message": {
      return <CandidateLine text={entry.text} />;
    }
    case "agent_message": {
      return (
        <div className="chat-message" data-discuss-scope="">
          <AgentLine text={entry.text} />
          <DiscussSeparately interviewId={interviewId} origin={{ kind: "message", id: entry.id }} />
        </div>
      );
    }
    case "turn_failed": {
      return <p role="alert">Интервьюер не смог ответить: {entry.message}</p>;
    }
    case "turn_interrupted":
    case "permission_request": {
      return null;
    }
    default: {
      return entry satisfies never;
    }
  }
}

/** The «Интервьюер» column beside the current question: a chat with the interviewer. */
export function InterviewerChat({
  interviewId,
  sessionId,
}: {
  interviewId: string;
  sessionId: string;
}) {
  const { view, notice, lost, prompt } = useSessionEvents(sessionId);
  const status = lost === null ? (view?.status ?? null) : null;
  return (
    <aside className="interviewer" aria-label="Интервьюер">
      <h4>Интервьюер</h4>
      <ol className="interviewer-lines nowheel" aria-label="Сообщения интервьюера">
        {(view?.entries ?? []).map((entry) => (
          <li key={entry.id}>
            <Line entry={entry} interviewId={interviewId} />
          </li>
        ))}
      </ol>
      {view?.agentText === "hidden" && status !== null && status !== "ended" ? (
        <p className="muted">Ответы интервьюера скрыты, пока вы не ответите на вопрос.</p>
      ) : null}
      {status === "working" || status === "starting" ? (
        <p className="muted" aria-live="polite">
          Агент работает…
        </p>
      ) : null}
      {lost === null ? null : <p role="alert">{lost}</p>}
      {notice === null ? null : <output>{notice}</output>}
      <ChatForm
        status={status}
        onSend={prompt}
        label="Сообщение интервьюеру"
        placeholder="Уточнить вопрос"
      />
    </aside>
  );
}
