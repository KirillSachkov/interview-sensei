import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { fetchDebrief } from "@/shared/api";

function DebriefBody({ interviewId, attemptId }: { interviewId: string; attemptId: string }) {
  const debrief = useQuery({
    queryKey: ["interviews", interviewId, "attempts", attemptId],
    queryFn: async () => fetchDebrief(interviewId, attemptId),
  });
  if (debrief.isError) {
    return <p role="alert">Разбор не загрузился: {debrief.error.message}</p>;
  }
  if (debrief.data === undefined) {
    return <p className="muted">Загружаем разбор…</p>;
  }
  const { grade, gradedBy, gaps, justification, strongAnswer } = debrief.data;
  return (
    <section className="debrief" aria-label="Разбор">
      <p>
        Оценка: <strong>{grade} из 3</strong>
        {gradedBy === "quiz" ? <span className="tag">квиз</span> : null}
      </p>
      <h4>Пробелы</h4>
      <p>{gaps.trim() === "" ? "Нет" : gaps}</p>
      <h4>Обоснование</h4>
      <p>{justification}</p>
      <h4>Набросок сильного ответа</h4>
      <p>{strongAnswer}</p>
    </section>
  );
}

/** «Посмотреть разбор»: the Grade stays hidden until the Candidate opens it. */
export function Debrief({ interviewId, attemptId }: { interviewId: string; attemptId: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className="ghost"
        aria-expanded={open}
        onClick={() => {
          setOpen((current) => !current);
        }}
      >
        {open ? "Скрыть разбор" : "Посмотреть разбор"}
      </button>
      {open ? <DebriefBody interviewId={interviewId} attemptId={attemptId} /> : null}
    </>
  );
}
