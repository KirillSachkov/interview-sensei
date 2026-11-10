import type { InterviewView, QuestionCard as Card } from "@/shared/api";

import { sessionWindowWidths } from "../../model/session-windows";

import { DiscussSeparately } from "./discuss-separately";
import { QuestionLink } from "./question-link";
import { QuestionCard } from "./question-card";
import { SideThreads } from "./side-threads";
import { SummaryDebrief } from "./summary-debrief";

/** An ended question leaves room for the threads beside it. */
function ResultRow({
  interview,
  card,
  number,
}: {
  interview: InterviewView;
  card: Card;
  number: number;
}) {
  return (
    <li
      className="result-row"
      style={{ gridTemplateColumns: `${sessionWindowWidths.question}px max-content` }}
    >
      {number > 1 ? <QuestionLink /> : null}
      <QuestionCard
        interviewId={interview.id}
        targetId={interview.targetId}
        card={card}
        number={number}
        stage="ended"
        discuss={
          <DiscussSeparately
            edge
            interviewId={interview.id}
            origin={{ kind: "question", id: card.id }}
          />
        }
      />
      <SideThreads view={interview} card={card} number={number} />
    </li>
  );
}

/**
 * A Mock interview that ended: its summary Debrief and every card with its Side threads to the
 * right. A Debrief opens new ones.
 */
export function InterviewResult({ interview }: { interview: InterviewView }) {
  const finished = interview.status === "finished";
  return (
    <section className="mock" aria-label="Итог мока">
      <header className="mock-head">
        <h3>{finished ? "Мок завершён" : "Мок прерван"}</h3>
      </header>
      {finished ? null : (
        <p className="muted">
          Агент остановился раньше конца мока. Записанные ответы и их разборы сохранены.
        </p>
      )}
      <SummaryDebrief interviewId={interview.id} />
      <ol className="mock-questions result" aria-label="Вопросы">
        {interview.questions.map((card, index) => (
          <ResultRow key={card.id} interview={interview} card={card} number={index + 1} />
        ))}
      </ol>
    </section>
  );
}
