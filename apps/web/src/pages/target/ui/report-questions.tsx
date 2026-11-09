import { useState } from "react";

import type { InboxReport, ReferenceAnswer, ReportQuestion, ReviewAction } from "@/shared/api";

import { useReview, useSelection } from "../model/report-review";

/** The marks of a Question: «новый», «не подтверждён», «скрыт», ⚠ with its comment, 👍. */
function QuestionMarks({ question }: { question: ReportQuestion }) {
  return (
    <span className="report-marks">
      {question.unseen ? <span className="tag accent">новый</span> : null}
      {question.unconfirmed ? <span className="tag">не подтверждён</span> : null}
      {question.hidden ? <span className="tag">скрыт</span> : null}
      {question.rating === "useful" ? <span className="tag">👍</span> : null}
      {question.rating === "wrong" ? (
        <span className="tag warning">⚠ {question.ratingComment ?? "ошибка"}</span>
      ) : null}
    </span>
  );
}

const origins: Readonly<Record<ReferenceAnswer["origin"], string>> = {
  material: "из материала",
  internet: "из интернета",
  agent: "из знаний агента",
  candidate: "проверен кандидатом",
};

/** «, часть N» after a material, or nothing without a part. */
function partText(part: number | null): string {
  return part === null ? "" : `, часть ${part}`;
}

/** The material of the Question with its part, and its reference answer, folded. */
function QuestionOrigin({ question }: { question: ReportQuestion }) {
  const { source, referenceAnswer: answer } = question;
  return (
    <>
      {source === null ? null : (
        <p className="report-question-source muted">
          Из «{source.title}»{partText(source.part)}
        </p>
      )}
      {answer === null ? null : (
        <details className="report-reference">
          <summary>
            Опорный ответ{" "}
            <span className="tag">
              {origins[answer.origin]}
              {partText(answer.part)}
            </span>
          </summary>
          <ul>
            {answer.points.map((point, index) => (
              // The points are the agent's text and may repeat.
              // oxlint-disable-next-line react/no-array-index-key -- the points never change
              <li key={index}>{point}</li>
            ))}
          </ul>
          <p>{answer.sample}</p>
        </details>
      )}
    </>
  );
}

function QuestionLine({
  question,
  checked,
  onToggle,
}: {
  question: ReportQuestion;
  checked: boolean;
  onToggle: (checked: boolean) => void;
}) {
  return (
    <li className="question report-question">
      <label className="report-question-line">
        <input
          type="checkbox"
          aria-label={`Выбрать «${question.text}»`}
          checked={checked}
          onChange={(event) => {
            onToggle(event.target.checked);
          }}
        />
        <span className={question.hidden ? "muted" : undefined}>{question.text}</span>
      </label>
      <QuestionMarks question={question} />
      <QuestionOrigin question={question} />
    </li>
  );
}

const actions: readonly { action: Exclude<ReviewAction, "warn">; label: string }[] = [
  { action: "hide", label: "Скрыть" },
  { action: "delete", label: "Удалить" },
  { action: "confirm", label: "👍 Полезный" },
];

/** ⚠ with an optional comment for the chosen Questions. */
function WarnForm({ onWarn, disabled }: { onWarn: (comment: string) => void; disabled: boolean }) {
  const [comment, setComment] = useState("");
  return (
    <form
      className="report-warn"
      onSubmit={(event) => {
        event.preventDefault();
        onWarn(comment);
      }}
    >
      <input
        aria-label="Комментарий к ⚠"
        placeholder="Что не так с вопросом"
        value={comment}
        onChange={(event) => {
          setComment(event.target.value);
        }}
      />
      <button type="submit" disabled={disabled}>
        ⚠ Ошибка
      </button>
    </form>
  );
}

/**
 * The bulk actions for the chosen Questions: hide, delete, ⚠ with a comment, 👍. Deleting a
 * Question with Attempts hides it instead.
 */
function BulkActions({
  targetId,
  questionIds,
  onDone,
}: {
  targetId: string;
  questionIds: readonly string[];
  onDone: () => void;
}) {
  const review = useReview(targetId);
  const run = (action: ReviewAction, comment?: string) => {
    review.mutate(
      { action, questionIds, ...(comment === undefined ? {} : { comment }) },
      { onSuccess: onDone },
    );
  };
  return (
    <fieldset className="report-bulk" aria-label="Действия с выбранными">
      <p>Выбрано: {questionIds.length}</p>
      <div className="report-bulk-buttons">
        {actions.map(({ action, label }) => (
          <button
            key={action}
            type="button"
            disabled={review.isPending}
            onClick={() => {
              run(action);
            }}
          >
            {label}
          </button>
        ))}
      </div>
      <WarnForm
        disabled={review.isPending}
        onWarn={(comment) => {
          run("warn", comment);
        }}
      />
      <p className="muted">Вопрос с попытками при удалении скрывается, история остаётся.</p>
      {review.error === null ? null : <p role="alert">Не сохранилось: {review.error.message}</p>}
    </fieldset>
  );
}

/** The added Questions under their Sections and Topics, each with its checkbox. */
function SectionList({
  report,
  chosen,
  onToggle,
}: {
  report: InboxReport;
  chosen: ReadonlySet<string>;
  onToggle: (id: string, checked: boolean) => void;
}) {
  return (
    <ul className="report-sections" aria-label="Добавленные вопросы">
      {report.sections.map((section) => (
        <li key={section.id ?? "none"}>
          <h4>{section.name}</h4>
          <ul className="report-topics">
            {section.topics.map((topic) => (
              <li key={topic.id}>
                <p className="report-topic">
                  {topic.name} <span className="tag">{topic.questions.length}</span>
                </p>
                <ul className="questions">
                  {topic.questions.map((question) => (
                    <QuestionLine
                      key={question.id}
                      question={question}
                      checked={chosen.has(question.id)}
                      onToggle={(checked) => {
                        onToggle(question.id, checked);
                      }}
                    />
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ul>
  );
}

/** The added Questions with checkboxes and bulk actions for the chosen ones. */
export function AddedQuestions({
  targetId,
  report,
  onlyNew,
}: {
  targetId: string;
  report: InboxReport;
  onlyNew: boolean;
}) {
  const selection = useSelection();
  const shown = report.sections.flatMap((section) =>
    section.topics.flatMap((topic) => topic.questions.map((question) => question.id)),
  );
  const chosen = shown.filter((id) => selection.chosen.has(id));
  if (shown.length === 0) {
    return <p className="muted">{onlyNew ? "Новых вопросов нет." : "Вопросов нет."}</p>;
  }
  return (
    <>
      <button
        type="button"
        className="ghost"
        onClick={() => {
          selection.set(chosen.length === shown.length ? [] : shown);
        }}
      >
        {chosen.length === shown.length ? "Снять выбор" : "Выбрать все"}
      </button>
      <SectionList
        report={report}
        chosen={selection.chosen}
        onToggle={(id, checked) => {
          selection.toggle(id, checked);
        }}
      />
      {chosen.length === 0 ? null : (
        <BulkActions
          targetId={targetId}
          questionIds={chosen}
          onDone={() => {
            selection.set([]);
          }}
        />
      )}
    </>
  );
}
