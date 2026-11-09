// The parts that the interviewer chat and the Side thread chat share: the Candidate's line, the
// agent's line and the message form.
import { useState } from "react";
import type { SubmitEvent } from "react";

import type { SessionView } from "@/shared/api";
import { AgentMarkdown } from "@/shared/ui/markdown";

/** The Candidate's message: «Вы: <text>». */
export function CandidateLine({ text }: { text: string }) {
  return (
    <p className="chat-line mine">
      <span className="muted">Вы: </span>
      {text}
    </p>
  );
}

/** The agent's message, rendered as Markdown. */
export function AgentLine({ text }: { text: string }) {
  return (
    <div className="chat-line">
      <AgentMarkdown text={text} />
    </div>
  );
}

/** The Candidate types while the agent works, and sends once it waits for a message. */
export function ChatForm({
  status,
  onSend,
  label,
  placeholder,
}: {
  status: SessionView["status"] | null;
  onSend: (text: string) => void;
  label: string;
  placeholder: string;
}) {
  const [text, setText] = useState("");
  const submit = (event: SubmitEvent) => {
    event.preventDefault();
    if (text.trim() !== "" && status === "idle") {
      onSend(text);
      setText("");
    }
  };
  return (
    <form className="interviewer-form" onSubmit={submit}>
      <input
        className="nodrag nopan"
        aria-label={label}
        placeholder={placeholder}
        value={text}
        disabled={status !== "idle" && status !== "working"}
        onChange={(event) => {
          setText(event.target.value);
        }}
      />
      <button type="submit" disabled={status !== "idle" || text.trim() === ""}>
        Отправить
      </button>
    </form>
  );
}
