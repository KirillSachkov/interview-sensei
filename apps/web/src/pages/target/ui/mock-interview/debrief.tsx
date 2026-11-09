import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { fetchDebrief } from "@/shared/api";
import type { AttemptDebrief } from "@/shared/api";

import { DisputeForm } from "./dispute-form";

/** The Grade, «~~1~~ → 3» after a Dispute, with the reason of the correction. */
function GradeLine({ debrief }: { debrief: AttemptDebrief }) {
  const { grade, gradedBy, dispute } = debrief;
  return (
    <>
      <p>
        Оценка:{" "}
        {dispute === null ? (
          <strong>{grade} из 3</strong>
        ) : (
          <>
            <s>{grade}</s> → <strong>{dispute.grade} из 3</strong>
          </>
        )}
        {gradedBy === "quiz" ? <span className="tag">квиз</span> : null}
        {gradedBy === "skip" ? <span className="tag">пропущено</span> : null}
        {debrief.hinted ? <span className="tag">с подсказкой</span> : null}
      </p>
      {dispute === null ? null : (
        <p>
          <span className="muted">Причина исправления: </span>
          {dispute.reason}
        </p>
      )}
    </>
  );
}

/** «Оспорить оценку» and its form. */
function Dispute({ interviewId, attemptId }: { interviewId: string; attemptId: string }) {
  const [open, setOpen] = useState(false);
  return open ? (
    <DisputeForm
      interviewId={interviewId}
      attemptId={attemptId}
      onClose={() => {
        setOpen(false);
      }}
    />
  ) : (
    <button
      type="button"
      className="ghost"
      onClick={() => {
        setOpen(true);
      }}
    >
      Оспорить оценку
    </button>
  );
}

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
  const { gaps, justification, strongAnswer } = debrief.data;
  return (
    <section className="debrief" aria-label="Разбор">
      <GradeLine debrief={debrief.data} />
      <h4>Пробелы</h4>
      <p>{gaps.trim() === "" ? "Нет" : gaps}</p>
      <h4>Обоснование</h4>
      <p>{justification}</p>
      {strongAnswer === "" ? null : (
        <>
          <h4>Набросок сильного ответа</h4>
          <p>{strongAnswer}</p>
        </>
      )}
      <Dispute interviewId={interviewId} attemptId={attemptId} />
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
