import { useState } from "react";
import type { DragEvent } from "react";

/** How a chat of a session kind takes files with a message, such as the Target setup. */
export interface ChatAttachments {
  /** Why the file cannot go with a message, or null when it can. */
  readonly refusal: (file: File) => string | null;
  /** Sends one file before the message; rejects with a message for the Candidate. */
  readonly send: (file: File) => Promise<void>;
}

interface Attached {
  readonly id: string;
  readonly file: File;
}

/** The message with a line that names its files: the agent learns of them from the prompt. */
function withFiles(text: string, files: readonly File[]): string {
  const line = `Прикреплённые файлы: ${files.map((file) => `«${file.name}»`).join(", ")}.`;
  return text.trim() === "" ? line : `${text}\n\n${line}`;
}

/** Sends the files in order; resolves the ones sent before a failure and the failure. */
async function sendAll(attachments: ChatAttachments, files: readonly Attached[]) {
  const sent: Attached[] = [];
  try {
    for (const entry of files) {
      // oxlint-disable-next-line eslint/no-await-in-loop -- the materials keep the order of the files
      await attachments.send(entry.file);
      sent.push(entry);
    }
    return { sent, failure: null };
  } catch (error) {
    return { sent, failure: error instanceof Error ? error.message : String(error) };
  }
}

/** The form takes files dropped onto it from the desktop, when the chat takes files at all. */
function dropHandlers(
  attachments: ChatAttachments | undefined,
  add: (files: Iterable<File>) => void,
) {
  return {
    handleDragOver: (event: DragEvent) => {
      if (attachments !== undefined && event.dataTransfer.types.includes("Files")) {
        event.preventDefault();
      }
    },
    handleDrop: (event: DragEvent) => {
      if (attachments !== undefined) {
        event.preventDefault();
        add(event.dataTransfer.files);
      }
    },
  };
}

/**
 * The files of the next message: 📎 and a drop add them, ✕ removes one. `send` sends them with
 * the message and resolves its text; null when a file failed and the message stays unsent.
 */
export function useAttachedFiles(attachments: ChatAttachments | undefined) {
  const [files, setFiles] = useState<Attached[]>([]);
  const [problem, setProblem] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const add = (added: Iterable<File>) => {
    const list = [...added];
    const refusals = list.flatMap((file) => attachments?.refusal(file) ?? []);
    setProblem(refusals.length > 0 ? refusals.join(" ") : null);
    const accepted = list.filter((file) => attachments?.refusal(file) === null);
    setFiles((current) => [
      ...current,
      ...accepted.map((file) => ({ id: crypto.randomUUID(), file })),
    ]);
  };
  const remove = (id: string) => {
    setFiles((current) => current.filter((entry) => entry.id !== id));
  };
  const send = async (text: string): Promise<string | null> => {
    if (attachments === undefined || files.length === 0) {
      return text;
    }
    setSending(true);
    const { sent, failure } = await sendAll(attachments, files);
    setSending(false);
    setFiles((current) => current.filter((entry) => !sent.includes(entry)));
    setProblem(failure === null ? null : `Файл не отправлен: ${failure}`);
    return failure === null
      ? withFiles(
          text,
          sent.map((entry) => entry.file),
        )
      : null;
  };
  return {
    files,
    problem,
    sending,
    send,
    handleAdd: add,
    handleRemove: remove,
    ...dropHandlers(attachments, add),
  };
}

/** The files of the next message above the input, each with ✕, and why a file did not go. */
export function AttachedFiles({
  attached: { files, problem, handleRemove },
}: {
  attached: Pick<ReturnType<typeof useAttachedFiles>, "files" | "problem" | "handleRemove">;
}) {
  return (
    <>
      {files.length === 0 ? null : (
        <ul className="attached-files" aria-label="Прикреплённые файлы">
          {files.map(({ id, file }) => (
            <li key={id} className="attached-file">
              <span>{file.name}</span>
              <button
                type="button"
                className="ghost"
                aria-label={`Убрать «${file.name}»`}
                onClick={() => {
                  handleRemove(id);
                }}
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
      {problem === null ? null : <p role="alert">{problem}</p>}
    </>
  );
}

/** 📎: picks files from the disk. */
export function AttachButton({
  disabled,
  onAdd,
}: {
  disabled: boolean;
  onAdd: (files: Iterable<File>) => void;
}) {
  return (
    <label className="button ghost attach-button" title="Прикрепить файлы">
      <svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true">
        <path
          d="M14.5 9.5 9 15a3.2 3.2 0 0 1-4.5-4.5l6.2-6.2a2.1 2.1 0 0 1 3 3L7.6 13.4a1 1 0 0 1-1.5-1.5L11.5 6.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <input
        type="file"
        multiple
        className="visually-hidden"
        aria-label="Прикрепить файлы"
        disabled={disabled}
        onChange={(event) => {
          onAdd(event.target.files ?? []);
          event.target.value = "";
        }}
      />
    </label>
  );
}
