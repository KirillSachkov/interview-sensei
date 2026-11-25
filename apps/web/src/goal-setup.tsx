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
  const latestTurn = history.at(-1);
  const replyShownAsProposal =
    proposal &&
    latestTurn &&
    (proposal.turnId === undefined
      ? latestTurn.reply === proposal.text
      : latestTurn.turnId === proposal.turnId);
  const retrying = pending && !waiting;
  const stale = pending !== undefined && pending.revision !== draft.revision;
  const text = pending?.message ?? message;

  return (
    <>
      <h1 className={history.length ? "goal-setup-heading" : undefined}>
        К какому собеседованию хочешь подготовиться?
      </h1>
      <div className="setup">
        <div role="log" aria-label="Диалог настройки">
          <ol className="dialogue">
            {history.length === 0 && (
              <li>
                <p className="assistant-message">
                  Привет! Какая роль тебе интересна? Например, можешь написать
                  «Хочу готовиться на middle Go».
                </p>
              </li>
            )}
            {history.map((turn) => (
              <li key={turn.turnId}>
                <p className="candidate-message">{turn.message}</p>
                {(!replyShownAsProposal || turn !== latestTurn) && (
                  <p className="assistant-message">{turn.reply}</p>
                )}
              </li>
            ))}
          </ol>
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
            if (!text.trim() || waiting || stale) return;
            setMessage("");
            void client.send(text);
          }}
        >
          <label htmlFor="candidate-message">Твоя реплика</label>
          <textarea
            id="candidate-message"
            rows={2}
            maxLength={4000}
            value={text}
            readOnly={Boolean(pending)}
            onChange={(event) => setMessage(event.currentTarget.value)}
          />
          {waiting && <p role="status">Ждём ответа…</p>}
          {retrying && (
            <p role="alert">
              {stale
                ? "Черновик обновился. Проверь его и подготовь новую реплику."
                : "Ответ пока не получен. Можно повторить отправку."}
            </p>
          )}
          <div className="form-actions">
            {!stale && (
              <button type="submit" disabled={waiting || !text.trim()}>
                {retrying ? "Повторить отправку" : "Отправить"}
              </button>
            )}
            {retrying && (
              <button
                type="button"
                className="secondary"
                onClick={() => {
                  setMessage(pending.message);
                  client.edit();
                }}
              >
                {stale ? "Вернуть текст в поле" : "Изменить сообщение"}
              </button>
            )}
          </div>
        </form>
      </div>
    </>
  );
}
