import { useState } from "react";

import type { InboxReport, ReportSummary } from "@/shared/api";

import { sourceStatusText } from "../lib/source-names";
import { useMarkSeen, useReport, useReportHistory } from "../model/report-review";
import { HideList } from "./report-hide-list";
import { AddedQuestions } from "./report-questions";

const kindNames: Record<InboxReport["proposals"]["sections"][number]["kind"], string> = {
  conversation: "разговор",
  topics: "вопросы по темам",
  design: "проектирование",
};

/** The agent's proposals, which the Candidate applies in the setup chat. */
function Proposals({ proposals }: { proposals: InboxReport["proposals"] }) {
  if (proposals.sections.length === 0 && proposals.preferences.length === 0) {
    return null;
  }
  return (
    <section className="report-block" aria-label="Предложения агента">
      <h3>Предложения агента</h3>
      <ul>
        {proposals.sections.map((section) => (
          <li key={`section-${section.name}`}>
            Новая секция «{section.name}» ({kindNames[section.kind]}): {section.reason}
          </li>
        ))}
        {proposals.preferences.map((preference) => (
          <li key={`preference-${preference.text}`}>
            Пожелание «{preference.text}»: {preference.reason}
          </li>
        ))}
      </ul>
      <p className="muted">Применить их можно в чате настройки.</p>
    </section>
  );
}

/** The filter «Только новые» and «Отметить просмотренными». */
function NewFilter({
  targetId,
  report,
  onlyNew,
  onOnlyNew,
}: {
  targetId: string;
  report: InboxReport;
  onlyNew: boolean;
  onOnlyNew: (onlyNew: boolean) => void;
}) {
  const seen = useMarkSeen(targetId, report.id);
  return (
    <div className="report-filter">
      <label>
        <input
          type="checkbox"
          checked={onlyNew}
          onChange={(event) => {
            onOnlyNew(event.target.checked);
          }}
        />{" "}
        Только новые ({report.newQuestions})
      </label>
      {report.newQuestions === 0 ? null : (
        <button
          type="button"
          className="ghost"
          disabled={seen.isPending}
          onClick={() => {
            seen.mutate();
          }}
        >
          Отметить просмотренными
        </button>
      )}
    </div>
  );
}

/** What a processing read and added. */
function ProcessingBlocks({
  targetId,
  report,
  onlyNew,
  onOnlyNew,
}: {
  targetId: string;
  report: InboxReport;
  onlyNew: boolean;
  onOnlyNew: (onlyNew: boolean) => void;
}) {
  return (
    <>
      <section className="report-block" aria-label="Разобрано">
        <h3>Разобрано</h3>
        <ul>
          {report.sources.map((source) => (
            <li key={source.id}>
              {source.title} <span className="tag">{sourceStatusText(source)}</span>
            </li>
          ))}
        </ul>
      </section>
      <section className="report-block" aria-label="Добавлено">
        <h3>Добавлено вопросов: {report.added}</h3>
        <p className="muted">Отсеяно дубликатов: {report.duplicates}</p>
        <NewFilter targetId={targetId} report={report} onlyNew={onlyNew} onOnlyNew={onOnlyNew} />
        <AddedQuestions
          key={`${report.id}-${String(onlyNew)}`}
          targetId={targetId}
          report={report}
          onlyNew={onlyNew}
        />
      </section>
    </>
  );
}

function ReportBody({
  targetId,
  report,
  onlyNew,
  onOnlyNew,
}: {
  targetId: string;
  report: InboxReport;
  onlyNew: boolean;
  onOnlyNew: (onlyNew: boolean) => void;
}) {
  return (
    <>
      <p>{report.partial ? `Отчёт неполный. ${report.summary}` : report.summary}</p>
      {report.mode === "recheck" ? (
        <section className="report-block" aria-label="Скрыть?">
          <h3>Скрыть?</h3>
          <HideList key={report.id} targetId={targetId} toHide={report.toHide} />
        </section>
      ) : (
        <ProcessingBlocks
          targetId={targetId}
          report={report}
          onlyNew={onlyNew}
          onOnlyNew={onOnlyNew}
        />
      )}
      {report.doubtful.length === 0 ? null : (
        <section className="report-block" aria-label="Сомнительные вопросы">
          <h3>Сомнительные вопросы</h3>
          <ul>
            {report.doubtful.map((doubt) => (
              <li key={doubt.text}>
                {doubt.text} — <span className="muted">{doubt.reason}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
      <Proposals proposals={report.proposals} />
    </>
  );
}

const dateFormat = new Intl.DateTimeFormat("ru-RU", {
  day: "numeric",
  month: "long",
  hour: "2-digit",
  minute: "2-digit",
});

function summaryText(report: ReportSummary): string {
  const kind =
    report.mode === "recheck"
      ? `перепроверка, скрыть? ${report.toHide}`
      : `разбор, +${report.added}`;
  return `${dateFormat.format(new Date(report.createdAt))} — ${kind}${report.partial ? ", неполный" : ""}`;
}

/** «История отчётов»: the Target's reports, the newest first; the chosen one opens here. */
function History({
  targetId,
  current,
  onOpen,
}: {
  targetId: string;
  current: string;
  onOpen: (reportId: string) => void;
}) {
  const history = useReportHistory(targetId);
  const reports = history.data ?? [];
  if (reports.length < 2) {
    return null;
  }
  return (
    <label className="report-history">
      История отчётов
      <select
        value={current}
        onChange={(event) => {
          onOpen(event.target.value);
        }}
      >
        {reports.map((report) => (
          <option key={report.id} value={report.id}>
            {summaryText(report)}
          </option>
        ))}
      </select>
    </label>
  );
}

/**
 * The side panel of an Inbox report: what was processed, the added Questions with the filter
 * «Только новые» and bulk actions, the doubtful Questions and the agent's proposals; for a
 * recheck, the list «Скрыть?». «История отчётов» opens an earlier report here.
 */
export function InboxReportPanel({
  targetId,
  reportId,
  onClose,
}: {
  targetId: string;
  reportId: string;
  onClose: () => void;
}) {
  const [current, setCurrent] = useState(reportId);
  const [onlyNew, setOnlyNew] = useState(false);
  const report = useReport(targetId, current, onlyNew);
  const title = report.data?.mode === "recheck" ? "Отчёт о перепроверке" : "Отчёт о разборе";
  return (
    <aside className="island side-panel" aria-labelledby="inbox-report-title">
      <header className="setup-chat-head">
        <h2 id="inbox-report-title">{title}</h2>
        <button type="button" className="ghost" onClick={onClose}>
          Закрыть
        </button>
      </header>
      <History targetId={targetId} current={current} onOpen={setCurrent} />
      {report.isError ? <p role="alert">Отчёт не загрузился: {report.error.message}</p> : null}
      <div className="side-panel-body nowheel">
        {report.data === undefined ? null : (
          <ReportBody
            targetId={targetId}
            report={report.data}
            onlyNew={onlyNew}
            onOnlyNew={setOnlyNew}
          />
        )}
      </div>
    </aside>
  );
}
