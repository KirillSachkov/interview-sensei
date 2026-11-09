import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { fetchHistory } from "@/shared/api";
import type { HistoryFilter, PlanSection, SessionSummary } from "@/shared/api";

import { SessionCardBody } from "./session-card";

/** The local midnight of the date field's day, as ISO 8601; `days` moves it. */
function midnight(day: string, days = 0): string {
  const date = new Date(`${day}T00:00`);
  date.setDate(date.getDate() + days);
  return date.toISOString();
}

/** The filters as the server takes them: «По» includes its whole day. */
function filterOf({ from, to, sectionId }: Record<"from" | "to" | "sectionId", string>) {
  const filter: HistoryFilter = {
    ...(from === "" ? {} : { from: midnight(from) }),
    ...(to === "" ? {} : { to: midnight(to, 1) }),
    ...(sectionId === "" ? {} : { sectionId }),
  };
  return filter;
}

type Fields = Record<"from" | "to" | "sectionId", string>;

function DateField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label>
      {label}
      <input
        type="date"
        className="nodrag"
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
        }}
      />
    </label>
  );
}

function Filters({
  fields,
  sections,
  onChange,
}: {
  fields: Fields;
  sections: readonly PlanSection[];
  onChange: (fields: Fields) => void;
}) {
  return (
    <div className="history-filters">
      <DateField
        label="С"
        value={fields.from}
        onChange={(from) => {
          onChange({ ...fields, from });
        }}
      />
      <DateField
        label="По"
        value={fields.to}
        onChange={(to) => {
          onChange({ ...fields, to });
        }}
      />
      <label>
        Секция
        <select
          className="nodrag"
          value={fields.sectionId}
          onChange={(event) => {
            onChange({ ...fields, sectionId: event.target.value });
          }}
        >
          <option value="">Все секции</option>
          {sections.map((section) => (
            <option key={section.id} value={section.id}>
              {section.name}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

function Pages({
  page,
  pages,
  onPage,
}: {
  page: number;
  pages: number;
  onPage: (page: number) => void;
}) {
  return (
    <nav className="history-pages" aria-label="Страницы истории">
      <button
        type="button"
        className="ghost"
        disabled={page <= 1}
        onClick={() => {
          onPage(page - 1);
        }}
      >
        Назад
      </button>
      <span className="muted">
        Страница {page} из {pages}
      </span>
      <button
        type="button"
        className="ghost"
        disabled={page >= pages}
        onClick={() => {
          onPage(page + 1);
        }}
      >
        Дальше
      </button>
    </nav>
  );
}

function SessionList({
  sessions,
  sections,
  onShow,
}: {
  sessions: readonly SessionSummary[];
  sections: readonly PlanSection[];
  onShow: (id: string) => void;
}) {
  if (sessions.length === 0) {
    return <p className="muted">Сессий не найдено.</p>;
  }
  return (
    <ol className="session-cards history-list">
      {sessions.map((session) => (
        <li key={session.id}>
          <button
            type="button"
            className="session-card"
            onClick={() => {
              onShow(session.id);
            }}
          >
            <SessionCardBody session={session} sections={sections} />
          </button>
        </li>
      ))}
    </ol>
  );
}

/**
 * «История сессий»: every Mock interview of the Target, 20 a page, the newest first, with filters
 * by date and Section. A click puts the session on the canvas.
 */
export function SessionHistory({
  targetId,
  sections,
  onShow,
  onClose,
}: {
  targetId: string;
  sections: readonly PlanSection[];
  onShow: (id: string) => void;
  onClose: () => void;
}) {
  const [page, setPage] = useState(1);
  const [fields, setFields] = useState<Fields>({ from: "", to: "", sectionId: "" });
  const filter = filterOf(fields);
  const history = useQuery({
    queryKey: ["history", targetId, page, filter],
    queryFn: async () => fetchHistory(targetId, { page, ...filter }),
  });
  const pages = Math.max(1, Math.ceil((history.data?.total ?? 0) / (history.data?.pageSize ?? 1)));
  return (
    <section className="card history-panel nowheel" aria-label="История сессий">
      <header className="mock-head">
        <h3>История сессий</h3>
        <button type="button" className="ghost" onClick={onClose}>
          Закрыть
        </button>
      </header>
      <Filters
        fields={fields}
        sections={sections}
        onChange={(next) => {
          setFields(next);
          setPage(1);
        }}
      />
      {history.isError ? <p role="alert">История не загрузилась: {history.error.message}</p> : null}
      {history.data === undefined ? null : (
        <SessionList sessions={history.data.items} sections={sections} onShow={onShow} />
      )}
      <Pages page={page} pages={pages} onPage={setPage} />
    </section>
  );
}
