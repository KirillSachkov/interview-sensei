import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { fetchDebrief, recordDebriefOpened } from "@/shared/api";
import type { AttemptDebrief } from "@/shared/api";

import { DiscussSeparately } from "./discuss-separately";
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

/** The key points of the reference answer, ✓ for those the answer covered, and the disagreement. */
function ReferencePoints({ debrief }: { debrief: AttemptDebrief }) {
  const { referencePoints, referenceDisagreement } = debrief;
  if (referencePoints === null) {
    return null;
  }
  const covered = referencePoints.filter((point) => point.covered).length;
  return (
    <>
      <h4>
        Опорный ответ: раскрыто {covered} из {referencePoints.length}
      </h4>
      <ul className="reference-points">
        {referencePoints.map((point) => (
          <li key={point.text} className={point.covered ? "covered" : "missed"}>
            <span aria-hidden="true">{point.covered ? "✓" : "✗"}</span>{" "}
            <span className="visually-hidden">{point.covered ? "Раскрыт:" : "Не раскрыт:"}</span>{" "}
            {point.text}
          </li>
        ))}
      </ul>
      {referenceDisagreement === null ? null : (
        <p>
          <span className="muted">Интервьюер не согласен с опорным ответом: </span>
          {referenceDisagreement}
        </p>
      )}
    </>
  );
}

function DebriefBody({ interviewId, attemptId }: { interviewId: string; attemptId: string }) {
  const debrief = useQuery({
    queryKey: ["interviews", interviewId, "attempts", attemptId],
    // The Candidate opens the Debrief here: its Grade may go to Side threads from now on.
    queryFn: async () => {
      await recordDebriefOpened(interviewId, attemptId);
      return fetchDebrief(interviewId, attemptId);
    },
  });
  if (debrief.isError) {
    return <p role="alert">Разбор не загрузился: {debrief.error.message}</p>;
  }
  if (debrief.data === undefined) {
    return <p className="muted">Загружаем разбор…</p>;
  }
  const { gaps, justification, strongAnswer } = debrief.data;
  return (
    <section className="debrief" aria-label="Разбор" data-discuss-scope="">
      <GradeLine debrief={debrief.data} />
      <ReferencePoints debrief={debrief.data} />
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
      <DiscussSeparately interviewId={interviewId} origin={{ kind: "debrief", id: attemptId }} />
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
