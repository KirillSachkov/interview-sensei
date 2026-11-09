import { useQuery } from "@tanstack/react-query";
import { useId } from "react";

import { fetchSources } from "@/shared/api";
import type { InboxState, SourceView } from "@/shared/api";

import { sourceStatusText, sourceTypeNames } from "../lib/source-names";
import { useInbox, useStartProcessing, useStopProcessing } from "../model/inbox";
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

/** From this many materials «разбирается» on, the card shows them as one line (#3, round 4). */
const collapsedFrom = 3;

type Entry =
  | { readonly type: "source"; readonly source: SourceView }
  | { readonly type: "processing"; readonly count: number };

/** The materials in order; three or more «разбирается» become one line where the first one was. */
function entries(list: readonly SourceView[]): Entry[] {
  const processing = list.filter((source) => source.status === "processing").length;
  if (processing < collapsedFrom) {
    return list.map((source) => ({ type: "source", source }));
  }
  const first = list.findIndex((source) => source.status === "processing");
  return list.flatMap((source, index): Entry[] => {
    if (source.status !== "processing") {
      return [{ type: "source", source }];
    }
    return index === first ? [{ type: "processing", count: processing }] : [];
  });
}

function ProcessingItem({ count }: { count: number }) {
  return (
    <li className="source-item">
      <span className="source-title">Разбирается материалов: {count}</span>
      <span className="source-tags">
        <span className="tag source-status source-processing">разбирается</span>
      </span>
    </li>
  );
}

/** «Идёт разбор…» with «Остановить разбор». */
function RunningLine({ targetId }: { targetId: string }) {
  const stop = useStopProcessing(targetId);
  return (
    <>
      <p className="inbox-waiting">
        <span className="muted">Идёт разбор…</span>
        <button
          type="button"
          className="ghost"
          disabled={stop.isPending}
          onClick={() => {
            stop.mutate();
          }}
        >
          Остановить разбор
        </button>
      </p>
      {stop.error === null ? null : <p role="alert">Разбор не остановился: {stop.error.message}</p>}
    </>
  );
}

/**
 * «Не разобрано: N» with «Запустить разбор», «Идёт разбор…» with «Остановить разбор», and the link
 * to the latest report.
 */
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
      {run === null ? null : <RunningLine targetId={targetId} />}
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
 * «Материалы» in the «Цель» zone: the first six materials with their status, three or more of them
 * «разбирается» as one line, the materials that wait for processing, «Запустить разбор»,
 * «Остановить разбор» and the latest Inbox report. While a processing runs,
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
  const list = entries(sources.data ?? []);
  const hidden = list
    .slice(shown)
    .reduce((sum, entry) => sum + (entry.type === "source" ? 1 : entry.count), 0);
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
          {list
            .slice(0, shown)
            .map((entry) =>
              entry.type === "source" ? (
                <SourceItem key={entry.source.id} source={entry.source} />
              ) : (
                <ProcessingItem key="processing" count={entry.count} />
              ),
            )}
        </ul>
      )}
      {hidden > 0 ? <p className="muted">И ещё {hidden}</p> : null}
      {inbox.data === undefined ? null : (
        <InboxLine targetId={targetId} inbox={inbox.data} onReport={onReport} />
      )}
    </article>
  );
}
