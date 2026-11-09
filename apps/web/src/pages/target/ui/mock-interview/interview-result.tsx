import type { InterviewView } from "@/shared/api";

import { QuestionCard } from "./question-card";
import { SummaryDebrief } from "./summary-debrief";

/** A Mock interview that ended: its summary Debrief and every card. */
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
          <li key={card.id}>
            <QuestionCard
              interviewId={interview.id}
              card={card}
              number={index + 1}
              canAnswer={false}
            />
          </li>
        ))}
      </ol>
    </section>
  );
}
