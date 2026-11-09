import type { InterviewView } from "@/shared/api";

import { QuestionCard } from "./question-card";

/** A Mock interview that ended: the interviewer's summary and next step, and every card. */
export function InterviewResult({ interview }: { interview: InterviewView }) {
  const finished = interview.status === "finished";
  return (
    <section className="mock" aria-label="Итог мока">
      <header className="mock-head">
        <h3>{finished ? "Мок завершён" : "Мок прерван"}</h3>
      </header>
      {interview.summary === null ? null : <p>{interview.summary}</p>}
      {interview.nextStep === null ? null : (
        <p>
          <span className="muted">Следующий шаг: </span>
          {interview.nextStep}
        </p>
      )}
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
