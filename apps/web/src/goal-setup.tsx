import { useState, useSyncExternalStore } from "react";
import type { goalSetupClient } from "./goal-setup-client.js";

export function GoalSetup({
  client,
}: {
  client: ReturnType<typeof goalSetupClient>;
}) {
  const { setup, pending, waiting } = useSyncExternalStore(
    client.subscribe,
    client.snapshot,
  );
  const [message, setMessage] = useState("");
  const { history, draft } = setup;
  const proposal =
    draft.current?.kind === "proposal" ? draft.current : undefined;
  const replyShownAsProposal =
    proposal && history.at(-1)?.reply === proposal.text;
  const retrying = pending && !waiting;
  const text = pending?.message ?? message;

  return (
    <>
      <h1>К какому собеседованию хочешь подготовиться?</h1>
      <div className="setup">
        <div role="log" aria-label="Диалог настройки">
          {history.length > 0 && (
            <ol className="dialogue">
              {history.map((turn, index) => (
                <li key={turn.turnId}>
                  <p className="candidate-message">{turn.message}</p>
                  {(!replyShownAsProposal || index !== history.length - 1) && (
                    <p className="assistant-message">{turn.reply}</p>
                  )}
                </li>
              ))}
            </ol>
          )}
          {proposal && (
            <section className="proposal" aria-labelledby="proposal-title">
              <h2 id="proposal-title">
                Предложение цели · версия {proposal.version}
              </h2>
              <p>{proposal.text}</p>
            </section>
          )}
        </div>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (!text.trim() || waiting) return;
            setMessage("");
            void client.send(text);
          }}
        >
          <label htmlFor="candidate-message">Твоя реплика</label>
          <textarea
            id="candidate-message"
            rows={2}
            maxLength={4000}
            placeholder={
              history.length === 0
                ? "Например, хочу готовиться на middle Go"
                : undefined
            }
            value={text}
            readOnly={Boolean(pending)}
            onChange={(event) => setMessage(event.currentTarget.value)}
          />
          {waiting && <p role="status">Ждём ответа…</p>}
          {retrying && (
            <p role="alert">
              {pending.revision === draft.revision
                ? "Ответ пока не получен. Можно повторить отправку."
                : "Черновик обновился. Проверь его перед повторной отправкой."}
            </p>
          )}
          <div className="form-actions">
            <button type="submit" disabled={waiting || !text.trim()}>
              {retrying ? "Повторить отправку" : "Отправить"}
            </button>
            {retrying && (
              <button
                type="button"
                className="secondary"
                onClick={() => {
                  setMessage(pending.message);
                  client.edit();
                }}
              >
                Изменить сообщение
              </button>
            )}
          </div>
        </form>
      </div>
    </>
  );
}
