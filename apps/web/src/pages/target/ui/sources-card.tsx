import { useQuery } from "@tanstack/react-query";
import { useId } from "react";

import { fetchSources } from "@/shared/api";
import type { InboxState, SourceView } from "@/shared/api";

import { sourceStatusText, sourceTypeNames } from "../lib/source-names";
import { useInbox, useStartProcessing } from "../model/inbox";
import { sourcesQueryKey } from "../model/source-attachments";

/** The card shows this many materials, the first added first. */
const shown = 6;

function SourceItem({ source }: { source: SourceView }) {
  const status = sourceStatusText(source);
  return (
    <li className="source-item">
      {source.url === null ? (
        <span className="source-title">{source.title}</span>
      ) : (
        <a className="source-title" href={source.url} target="_blank" rel="noreferrer">
          {source.title}
        </a>
      )}
      <span className="source-tags">
        <span className="tag">{sourceTypeNames[source.type]}</span>
        <span className={`tag source-status source-${source.status}`} title={status}>
          {status}
        </span>
      </span>
    </li>
  );
}

/** «Не разобрано: N» with «Запустить разбор», «Идёт разбор…», and the link to the latest report. */
function InboxLine({
  targetId,
  inbox,
  onReport,
}: {
  targetId: string;
  inbox: InboxState;
  onReport: (reportId: string) => void;
}) {
  const start = useStartProcessing(targetId);
  const { run, unprocessed, latestReport } = inbox;
  return (
    <div className="inbox-line">
      {run === null ? null : <p className="muted">Идёт разбор…</p>}
      {run === null && unprocessed > 0 ? (
        <p className="inbox-waiting">
          <span>Не разобрано: {unprocessed}</span>
          <button
            type="button"
            disabled={start.isPending}
            onClick={() => {
              start.mutate(null);
            }}
          >
            Запустить разбор
          </button>
        </p>
      ) : null}
      {start.error === null ? null : <p role="alert">Разбор не начался: {start.error.message}</p>}
      {latestReport === null ? null : (
        <button
          type="button"
          className="ghost"
          onClick={() => {
            onReport(latestReport.id);
          }}
        >
          Отчёт о разборе
        </button>
      )}
    </div>
  );
}

/**
 * «Материалы» in the «Цель» zone: the first six materials with their status, the materials that
 * wait for processing, «Запустить разбор» and the latest Inbox report. While a processing runs,
 * the card asks the server again every second.
 */
export function SourcesCard({
  targetId,
  onReport,
}: {
  targetId: string;
  onReport: (reportId: string) => void;
}) {
  const titleId = useId();
  const { inbox, running } = useInbox(targetId);
  const sources = useQuery({
    queryKey: sourcesQueryKey(targetId),
    queryFn: async () => fetchSources(targetId),
    refetchInterval: running ? 1000 : false,
  });
  const list = sources.data ?? [];
  return (
    <article className="card" aria-labelledby={titleId}>
      <h3 id={titleId} className="card-title">
        Материалы
      </h3>
      {sources.isError ? (
        <p role="alert">Материалы не загрузились: {sources.error.message}</p>
      ) : null}
      {list.length === 0 ? (
        <p className="muted">Материалов пока нет: прикрепите вакансию и резюме в чате настройки.</p>
      ) : (
        <ul className="source-list">
          {list.slice(0, shown).map((source) => (
            <SourceItem key={source.id} source={source} />
          ))}
        </ul>
      )}
      {list.length > shown ? <p className="muted">И ещё {list.length - shown}</p> : null}
      {inbox.data === undefined ? null : (
        <InboxLine targetId={targetId} inbox={inbox.data} onReport={onReport} />
      )}
    </article>
  );
}
