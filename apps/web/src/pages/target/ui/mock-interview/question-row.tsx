import type { ReactNode } from "react";
import type { InterviewView, QuestionCard as Card } from "@/shared/api";
import { useSessionWindow } from "../../model/session-windows";
import { DiscussSeparately } from "./discuss-separately";
import { QuestionLink } from "./question-link";
import { QuestionCard } from "./question-card";
import { SideThreads } from "./side-threads";

/** Whether the cards take answers: only while the Mock interview runs and is not finishing. */
function stageOf(view: InterviewView) {
  if (view.status === "paused") {
    return "paused";
  }
  if (view.status !== "running") {
    return "ended";
  }
  return view.finishRequestedAt === null ? "answering" : "finishing";
}

/** The question card with «Обсудить отдельно», and its Side threads to the right. */
export function QuestionRow({
  view,
  card,
  number,
  chat,
}: {
  view: InterviewView;
  card: Card;
  number: number;
  chat: ReactNode;
}) {
  const interviewer = useSessionWindow("interviewer", view.id);
  const question = useSessionWindow("question", card.id);
  return (
    <li
      className="mock-row"
      style={{
        gridTemplateColumns: `${interviewer.size.width}px ${question.size.width}px max-content`,
      }}
    >
      {chat}
      {number > 1 ? <QuestionLink /> : null}
      <QuestionCard
        interviewId={view.id}
        targetId={view.targetId}
        card={card}
        number={number}
        stage={stageOf(view)}
        discuss={
          <DiscussSeparately
            edge
            interviewId={view.id}
            origin={{ kind: "question", id: card.id }}
          />
        }
      />
      <SideThreads view={view} card={card} number={number} />
    </li>
  );
}
