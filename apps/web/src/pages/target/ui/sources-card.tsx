import { useQuery } from "@tanstack/react-query";
import { useId } from "react";

import { fetchSources } from "@/shared/api";
import type { SourceType, SourceView } from "@/shared/api";

import { sourcesQueryKey } from "../model/source-attachments";

const typeNames: Record<SourceType, string> = {
  vacancy: "вакансия",
  resume: "резюме",
  link: "ссылка",
  file: "файл",
  note: "заметка",
  transcript: "транскрипт",
};

/** The card shows this many materials, the first added first. */
const shown = 6;

function SourceItem({ source }: { source: SourceView }) {
  return (
    <li className="source-item">
      {source.url === null ? (
        <span className="source-title">{source.title}</span>
      ) : (
        <a className="source-title" href={source.url} target="_blank" rel="noreferrer">
          {source.title}
        </a>
      )}
      <span className="tag">{typeNames[source.type]}</span>
    </li>
  );
}

/** «Материалы» in the «Цель» zone: the first six materials of the Target. */
export function SourcesCard({ targetId }: { targetId: string }) {
  const titleId = useId();
  const sources = useQuery({
    queryKey: sourcesQueryKey(targetId),
    queryFn: async () => fetchSources(targetId),
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
    </article>
  );
}
