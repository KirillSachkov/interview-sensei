import type { ReactNode } from "react";

import { AgentMarkdown } from "@/shared/ui/markdown";

import "./chat.css";

/**
 * The Candidate's message: a bubble at the right. A screen reader hears «Вы:» before the text.
 */
export function CandidateMessage({ text }: { text: string }) {
  return (
    <div className="message message-mine">
      <p className="message-bubble">
        <span className="visually-hidden">Вы: </span>
        {text}
      </p>
    </div>
  );
}

/**
 * The agent's message as Markdown, at the left without a bubble. A screen reader hears «Агент:»
 * before the text; `actions` stand under it, such as «Обсудить отдельно».
 */
export function AgentMessage({ text, actions = null }: { text: string; actions?: ReactNode }) {
  return (
    <div className="message message-agent">
      <span className="visually-hidden">Агент: </span>
      <AgentMarkdown text={text} />
      {actions}
    </div>
  );
}

/** A line of the chat that is no message: a stopped turn or a failure. */
export function ChatNote({ children, alert = false }: { children: ReactNode; alert?: boolean }) {
  return (
    <p className="chat-note" role={alert ? "alert" : undefined}>
      {children}
    </p>
  );
}

/** Three moving dots with what the agent does now: «Агент работает…» or «Агент запускается…». */
export function AgentActivity({ text }: { text: string }) {
  return (
    <p className="agent-activity" aria-live="polite">
      <span className="typing-dots" aria-hidden="true">
        <span />
        <span />
        <span />
      </span>
      {text}
    </p>
  );
}
