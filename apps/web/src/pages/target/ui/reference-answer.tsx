import type { Question, ReferenceAnswer } from "@/shared/api";

import { useVerifyReference } from "../model/reference-checks";

/** The origin of a reference answer as the Candidate reads it. */
export const originNames: Readonly<Record<ReferenceAnswer["origin"], string>> = {
  material: "из материала",
  internet: "из интернета",
  agent: "из знаний агента",
  candidate: "проверен кандидатом",
};

/** «, часть N» after a material, or nothing without a part. */
export function partText(part: number | null): string {
  return part === null ? "" : `, часть ${part}`;
}

/** The host of a source link, as the Candidate reads it; the link itself for a broken URL. */
function hostOf(link: string): string {
  try {
    return new URL(link).host;
  } catch {
    return link;
  }
}

/**
 * The reference answer, folded: its origin in the summary, with the part for an answer «из
 * материала», then the key points, the sample and the links to the web sources of an answer «из
 * интернета».
 */
export function ReferenceAnswerDetails({ answer }: { answer: ReferenceAnswer }) {
  const links = answer.links ?? [];
  return (
    <details className="reference-answer">
      <summary>
        Опорный ответ{" "}
        <span className="tag">
          {originNames[answer.origin]}
          {answer.origin === "material" ? partText(answer.part) : ""}
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
      {links.length === 0 ? null : (
        <p className="reference-links">
          Источники:{" "}
          {links.map((link, index) => (
            <span key={link}>
              {index === 0 ? null : ", "}
              <a href={link} target="_blank" rel="noreferrer">
                {hostOf(link)}
              </a>
            </span>
          ))}
        </p>
      )}
    </details>
  );
}

/**
 * «Проверен»: the reference answer becomes «проверен кандидатом» at once, without the draft of
 * changes; nothing for an answer that is already.
 */
export function VerifyReference({ targetId, question }: { targetId: string; question: Question }) {
  const verify = useVerifyReference(targetId);
  if (question.referenceAnswer === null || question.referenceAnswer.origin === "candidate") {
    return null;
  }
  return (
    <>
      <button
        type="button"
        className="ghost"
        title="Отметить опорный ответ проверенным"
        disabled={verify.isPending}
        onClick={() => {
          verify.mutate(question.id);
        }}
      >
        Проверен
      </button>
      {verify.isError ? <p role="alert">Не сохранилось: {verify.error.message}</p> : null}
    </>
  );
}
