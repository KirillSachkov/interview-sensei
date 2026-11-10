import { agentName } from "@/entities/agent";
import { useSessionEvents } from "@/entities/session";
import {
  AgentActivity,
  AgentMessage,
  CandidateMessage,
  ChatNote,
  Composer,
  SessionOptions,
  optionsSummary,
} from "@/features/agent-chat";
import type { ChatEntry } from "@/shared/api";

import { DiscussSeparately } from "./discuss-separately";

/**
 * A line of the interviewer chat; tool calls never reach it. An interviewer message after the
 * first question has «Обсудить отдельно»: a Side thread discusses a question.
 */
function Line({
  entry,
  interviewId,
  discussable,
}: {
  entry: ChatEntry;
  interviewId: string;
  discussable: boolean;
}) {
  switch (entry.type) {
    case "candidate_message": {
      return <CandidateMessage text={entry.text} />;
    }
    case "agent_message": {
      return (
        <div data-discuss-scope="">
          <AgentMessage
            text={entry.text}
            actions={
              discussable ? (
                <DiscussSeparately
                  interviewId={interviewId}
                  origin={{ kind: "message", id: entry.id }}
                />
              ) : null
            }
          />
        </div>
      );
    }
    case "turn_failed": {
      return <ChatNote alert>Интервьюер не смог ответить: {entry.message}</ChatNote>;
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

/**
 * The «Интервьюер» column beside the current question: a chat with the interviewer. Its messages
 * from the chat entry `discussFrom` on, where the first question came, open Side threads; none
 * before the first question.
 */
export function InterviewerChat({
  interviewId,
  sessionId,
  discussFrom,
}: {
  interviewId: string;
  sessionId: string;
  discussFrom: number | null;
}) {
  const { view, notice, lost, prompt } = useSessionEvents(sessionId);
  const status = lost === null ? (view?.status ?? null) : null;
  return (
    <aside className="interviewer" aria-label="Интервьюер">
      <h4>
        Интервьюер
        {view === null
          ? null
          : ` · ${[agentName(view.agent), optionsSummary(view.options)].filter(Boolean).join(" · ")}`}
      </h4>
      <ol className="chat-entries interviewer-lines nowheel" aria-label="Сообщения интервьюера">
        {(view?.entries ?? []).map((entry, index) => (
          <li key={entry.id}>
            <Line
              entry={entry}
              interviewId={interviewId}
              discussable={discussFrom !== null && index >= discussFrom}
            />
          </li>
        ))}
      </ol>
      {view?.agentText === "hidden" && status !== null && status !== "ended" ? (
        <p className="muted">Ответы интервьюера скрыты, пока вы не ответите на вопрос.</p>
      ) : null}
      {status === "working" || status === "starting" ? (
        <AgentActivity text="Агент работает…" />
      ) : null}
      {lost === null ? null : <p role="alert">{lost}</p>}
      {notice === null ? null : <output>{notice}</output>}
      <Composer
        status={status}
        onSend={prompt}
        label="Сообщение интервьюеру"
        placeholder="Уточнить вопрос"
        tools={<SessionOptions view={lost === null ? view : null} />}
      />
    </aside>
  );
}
