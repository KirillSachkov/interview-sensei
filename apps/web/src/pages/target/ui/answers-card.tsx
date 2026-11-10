import { useId, useState } from "react";

import type { AnswerState } from "@/shared/api";

import { useAnswers, useStartAnswerSearch, useStopAnswerSearch } from "../model/answers";

/** The number the start window offers first (spec #70). */
const defaultCount = 20;
/** The most Questions one answer search may fill; the server refuses more. */
const maxCount = 200;

/** «Сколько наполнить»: a whole number from 1 to the limit. */
function CountField({
  count,
  limit,
  onCount,
}: {
  count: number;
  limit: number;
  onCount: (count: number) => void;
}) {
  return (
    <label className="answers-count">
      Сколько наполнить
      <input
        className="nodrag"
        type="number"
        min={1}
        max={limit}
        value={Number.isNaN(count) ? "" : count}
        onChange={(event) => {
          onCount(event.target.valueAsNumber);
        }}
      />
    </label>
  );
}

/** How many Questions have no reference answer, and how many more the queue holds. */
function Counts({ state }: { state: AnswerState }) {
  return (
    <>
      <p>Без опорного ответа: {state.withoutAnswer}</p>
      {state.queued === state.withoutAnswer ? null : (
        <p className="muted">
          В очереди {state.queued}: с ними вопросы из мока, ответ на которые агент дал из своих
          знаний.
        </p>
      )}
    </>
  );
}

/**
 * The start window of «Найти ответы»: how many Questions have no reference answer, how many to
 * fill, 20 by default, and the warning that the search spends the agent's subscription limits.
 */
function StartWindow({
  targetId,
  state,
  onClose,
}: {
  targetId: string;
  state: AnswerState;
  onClose: () => void;
}) {
  const titleId = useId();
  const limit = Math.min(state.queued, maxCount);
  const [count, setCount] = useState(Math.min(defaultCount, limit));
  const start = useStartAnswerSearch(targetId);
  const valid = Number.isInteger(count) && count >= 1 && count <= limit;
  return (
    <dialog open className="answers-window" aria-labelledby={titleId}>
      <h4 id={titleId}>Найти опорные ответы</h4>
      <Counts state={state} />
      <CountField count={count} limit={limit} onCount={setCount} />
      <p className="answers-warning">
        Каждый вопрос — примерно один поиск в интернете. Наполнение расходует лимиты подписки
        агента.
      </p>
      {start.error === null ? null : <p role="alert">Поиск не начался: {start.error.message}</p>}
      <div className="answers-actions">
        <button
          type="button"
          disabled={!valid || start.isPending}
          onClick={() => {
            start.mutate(count, { onSuccess: onClose });
          }}
        >
          Начать поиск
        </button>
        <button type="button" className="ghost" onClick={onClose}>
          Отмена
        </button>
      </div>
    </dialog>
  );
}

/** «Ищет ответы: N из M», or «Ждёт конца разбора материалов», with «Остановить». */
function RunLine({ targetId, run }: { targetId: string; run: NonNullable<AnswerState["run"]> }) {
  const stop = useStopAnswerSearch(targetId);
  return (
    <>
      <p className="inbox-waiting">
        <span className="muted">
          {run.status === "waiting"
            ? `Ждёт конца разбора материалов, затем наполнит ${run.total}`
            : `Ищет ответы: ${run.filled} из ${run.total}`}
        </span>
        <button
          type="button"
          className="ghost"
          disabled={stop.isPending}
          onClick={() => {
            stop.mutate();
          }}
        >
          Остановить
        </button>
      </p>
      {stop.error === null ? null : (
        <p role="alert">Наполнение не остановилось: {stop.error.message}</p>
      )}
    </>
  );
}

/** «Найти ответы» with its start window, or the line of a search that waits or runs. */
function SearchLine({ targetId, state }: { targetId: string; state: AnswerState }) {
  const [open, setOpen] = useState(false);
  if (state.run !== null) {
    return <RunLine targetId={targetId} run={state.run} />;
  }
  if (open) {
    return (
      <StartWindow
        targetId={targetId}
        state={state}
        onClose={() => {
          setOpen(false);
        }}
      />
    );
  }
  return (
    <p className="inbox-waiting">
      <span>Без опорного ответа: {state.withoutAnswer}</span>
      <button
        type="button"
        disabled={state.queued === 0}
        onClick={() => {
          setOpen(true);
        }}
      >
        Найти ответы
      </button>
    </p>
  );
}

/** «Отчёт о наполнении»: the latest answer report in the side panel. */
function ReportLink({
  report,
  onReport,
}: {
  report: AnswerState["latestReport"];
  onReport: (reportId: string) => void;
}) {
  if (report === null) {
    return null;
  }
  return (
    <button
      type="button"
      className="ghost"
      onClick={() => {
        onReport(report.id);
      }}
    >
      {report.partial ? "Отчёт о наполнении (неполный)" : "Отчёт о наполнении"}
    </button>
  );
}

/**
 * «Опорные ответы» in the «Цель» zone (spec #70): the Questions without a reference answer,
 * «Найти ответы» with its start window, «Ищет ответы: N из M» with «Остановить», and the latest
 * answer report.
 */
export function AnswersCard({
  targetId,
  onReport,
}: {
  targetId: string;
  onReport: (reportId: string) => void;
}) {
  const titleId = useId();
  const answers = useAnswers(targetId);
  const state = answers.data;
  return (
    <article className="card" aria-labelledby={titleId}>
      <h3 id={titleId} className="card-title">
        Опорные ответы
      </h3>
      {answers.isError ? (
        <p role="alert">Опорные ответы не загрузились: {answers.error.message}</p>
      ) : null}
      {state === undefined ? null : (
        <div className="inbox-line">
          <SearchLine targetId={targetId} state={state} />
          <ReportLink report={state.latestReport} onReport={onReport} />
        </div>
      )}
    </article>
  );
}
