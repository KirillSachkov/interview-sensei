import type { AnswerReport } from "@/shared/api";

import { useAnswerReport } from "../model/answers";
import { originNames } from "./reference-answer";

const number = (value: number) => value.toLocaleString("ru-RU");

/**
 * What the agent reported in its latest ACP usage_update: the tokens in its context, of its context
 * window, and the session's cost; or that it reported none. ACP gives no tokens spent in total.
 */
function usageText(usage: AnswerReport["usage"]): string {
  if (usage === null) {
    return "Агент не сообщил расход.";
  }
  const size = usage.contextSize === null ? "" : ` из ${number(usage.contextSize)}`;
  const tokens = `Токенов в контексте агента: ${number(usage.contextTokens)}${size}.`;
  return usage.cost === null
    ? tokens
    : `${tokens} Стоимость сессии: ${number(usage.cost.amount)} ${usage.cost.currency}.`;
}

function ReportBody({ report }: { report: AnswerReport }) {
  return (
    <>
      {report.partial ? <p className="tag warning">Неполный отчёт</p> : null}
      <p>{report.summary}</p>
      <section className="report-block" aria-label="Итог наполнения">
        <ul>
          <li>
            Наполнено: {report.filled} из {report.total}
          </li>
          <li>Из интернета: {report.internet}</li>
          <li>Из знаний агента: {report.agent}</li>
          <li>Не удалось наполнить: {report.failed.length}</li>
        </ul>
        <p className="muted">{usageText(report.usage)}</p>
      </section>
      {report.questions.length === 0 ? null : (
        <section className="report-block" aria-label="Наполненные вопросы">
          <h3>Наполненные вопросы</h3>
          <ul>
            {report.questions.map((question) => (
              <li key={question.questionId}>
                {question.text} <span className="tag">{originNames[question.origin]}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
      {report.failed.length === 0 ? null : (
        <section className="report-block" aria-label="Не удалось наполнить">
          <h3>Не удалось наполнить</h3>
          <ul>
            {report.failed.map((question) => (
              <li key={question.questionId}>
                {question.text}
                {question.reason === null ? null : (
                  <>
                    {" "}
                    — <span className="muted">{question.reason}</span>
                  </>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

/**
 * The side panel of an answer report: the counts by origin, the token usage or «агент не сообщил
 * расход», the filled Questions and those the search could not fill.
 */
export function AnswerReportPanel({
  targetId,
  reportId,
  onClose,
}: {
  targetId: string;
  reportId: string;
  onClose: () => void;
}) {
  const report = useAnswerReport(targetId, reportId);
  return (
    <aside className="island side-panel" aria-labelledby="answer-report-title">
      <header className="setup-chat-head">
        <h2 id="answer-report-title">Отчёт о наполнении ответов</h2>
        <button type="button" className="ghost" onClick={onClose}>
          Закрыть
        </button>
      </header>
      {report.isError ? <p role="alert">Отчёт не загрузился: {report.error.message}</p> : null}
      <div className="side-panel-body nowheel">
        {report.data === undefined ? null : <ReportBody report={report.data} />}
      </div>
    </aside>
  );
}
