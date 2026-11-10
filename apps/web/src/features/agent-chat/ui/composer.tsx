import { useState } from "react";
import type { KeyboardEvent, ReactNode, SubmitEvent } from "react";

import type { SessionView } from "@/shared/api";

import { AttachButton, AttachedFiles, useAttachedFiles } from "./attachments";
import type { ChatAttachments } from "./attachments";

/** Fits the field's height to its text; the styles cap it, and a longer text scrolls. */
function grow(field: HTMLTextAreaElement): void {
  field.style.height = "auto";
  field.style.height = `${field.scrollHeight}px`;
}

/** Enter sends the form; Shift+Enter and an input method's Enter stay in the text. */
function sendOnEnter(event: KeyboardEvent<HTMLTextAreaElement>): void {
  if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
    event.preventDefault();
    event.currentTarget.form?.requestSubmit();
  }
}

function SendIcon() {
  return (
    <svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true">
      <path
        d="M10 16V4M10 4l-5 5M10 4l5 5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function StopIcon() {
  return (
    <svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true">
      <rect x="5" y="5" width="10" height="10" rx="2" fill="currentColor" />
    </svg>
  );
}

/** The round buttons at the right of the composer: «Остановить» while the agent works, and send. */
function ComposerButtons({
  working,
  canSend,
  onStop,
}: {
  working: boolean;
  canSend: boolean;
  onStop: (() => void) | undefined;
}) {
  return (
    <>
      {working && onStop !== undefined ? (
        <button
          type="button"
          className="composer-round composer-stop"
          aria-label="Остановить"
          title="Остановить агента"
          onClick={onStop}
        >
          <StopIcon />
        </button>
      ) : null}
      <button
        type="submit"
        className="composer-round composer-send"
        aria-label="Отправить"
        title="Отправить (Enter)"
        disabled={!canSend}
      >
        <SendIcon />
      </button>
    </>
  );
}

interface ComposerProps {
  /** The session status, or null when the page lost the connection. */
  status: SessionView["status"] | null;
  onSend: (text: string) => void;
  onStop?: () => void;
  /** The accessible name of the field, such as «Сообщение». */
  label: string;
  placeholder: string;
  attachments?: ChatAttachments | undefined;
  tools?: ReactNode;
}

/** The text and files of the next message, and the submit that sends them once the agent waits. */
function useMessage({ status, onSend, attachments }: ComposerProps) {
  const [text, setText] = useState("");
  const attached = useAttachedFiles(attachments);
  const empty = text.trim() === "" && attached.files.length === 0;
  const canSend = status === "idle" && !empty && !attached.sending;
  const submit = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    const field = event.currentTarget.querySelector("textarea");
    if (!canSend) {
      return;
    }
    const message = await attached.send(text);
    if (message !== null) {
      onSend(message);
      setText("");
      if (field !== null) {
        field.style.height = "auto";
      }
    }
  };
  return { text, setText, attached, canSend, submit };
}

/**
 * The message box of every chat with an agent: a field that grows with the text, 📎 for files when
 * the chat takes them, and the round send button. Enter sends, Shift+Enter starts a line. The
 * Candidate types while the agent works and sends once it waits for a message; `onStop` adds
 * «Остановить» for the agent's turn. `tools` stand at the bottom left, such as the model choice.
 */
export function Composer(props: ComposerProps) {
  const { status, onStop, label, placeholder, attachments, tools = null } = props;
  const canType = status === "idle" || status === "working";
  const { text, setText, attached, canSend, submit } = useMessage(props);
  return (
    // oxlint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- a drop is a pointer shortcut; 📎 attaches the same files from the keyboard
    <form
      className="composer nodrag nopan nowheel"
      onSubmit={(event) => void submit(event)}
      onDragOver={attached.handleDragOver}
      onDrop={attached.handleDrop}
    >
      <AttachedFiles attached={attached} />
      <textarea
        aria-label={label}
        placeholder={placeholder}
        rows={1}
        disabled={!canType}
        value={text}
        onChange={(event) => {
          setText(event.target.value);
          grow(event.target);
        }}
        onKeyDown={sendOnEnter}
      />
      <div className="composer-bar">
        <div className="composer-tools">
          {attachments === undefined ? null : (
            <AttachButton disabled={!canType} onAdd={attached.handleAdd} />
          )}
          {tools}
        </div>
        <ComposerButtons working={status === "working"} canSend={canSend} onStop={onStop} />
      </div>
    </form>
  );
}
