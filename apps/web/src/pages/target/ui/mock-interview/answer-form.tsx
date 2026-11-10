import { useMutation } from "@tanstack/react-query";
import type { ReactNode } from "react";

import { Composer } from "@/features/agent-chat";

/** The same message box as every agent chat, with answer-specific actions and error handling. */
export function AnswerForm({
  label,
  send,
  actions = null,
}: {
  label: string;
  send: (text: string) => Promise<void>;
  actions?: ReactNode;
}) {
  const sending = useMutation({ mutationFn: send });
  return (
    <div className="answer-form">
      <Composer
        status={sending.isPending ? "starting" : "idle"}
        onSend={async (text) => sending.mutateAsync(text)}
        label={label}
        placeholder={label}
        sendLabel="Ответить"
        actions={actions}
      />
      {sending.isError ? <p role="alert">Ответ не отправлен: {sending.error.message}</p> : null}
    </div>
  );
}
