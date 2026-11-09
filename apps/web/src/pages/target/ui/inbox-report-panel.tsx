import { useQuery } from "@tanstack/react-query";

import { fetchInboxReport } from "@/shared/api";
import type { InboxReport } from "@/shared/api";

import { sourceStatusText } from "../lib/source-names";

const kindNames: Record<InboxReport["proposals"]["sections"][number]["kind"], string> = {
  conversation: "разговор",
  topics: "вопросы по темам",
  design: "проектирование",
};

/** The added Questions under their Sections and Topics. */
function AddedQuestions({ report }: { report: InboxReport }) {
  if (report.added === 0) {
    return <p className="muted">Новых вопросов нет.</p>;
  }
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
                    <li key={question.id} className="question">
                      {question.text}
                    </li>
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

function ReportBody({ report }: { report: InboxReport }) {
  return (
    <div className="side-panel-body nowheel">
      <p>{report.summary}</p>
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
        <AddedQuestions report={report} />
      </section>
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
    </div>
  );
}

/**
 * The side panel of an Inbox report: what was processed, how many Questions went where, how many
 * duplicates the server left out, the doubtful Questions and the agent's proposals.
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
  const report = useQuery({
    queryKey: ["targets", targetId, "inbox-reports", reportId],
    queryFn: async () => fetchInboxReport(targetId, reportId),
  });
  return (
    <aside className="island side-panel" aria-labelledby="inbox-report-title">
      <header className="setup-chat-head">
        <h2 id="inbox-report-title">Отчёт о разборе</h2>
        <button type="button" className="ghost" onClick={onClose}>
          Закрыть
        </button>
      </header>
      {report.isError ? <p role="alert">Отчёт не загрузился: {report.error.message}</p> : null}
      {report.data === undefined ? null : <ReportBody report={report.data} />}
    </aside>
  );
}
