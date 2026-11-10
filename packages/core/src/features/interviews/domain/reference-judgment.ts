// The interviewer's judgment against the reference answer (#64): which key points the answer
// covered, and whether the interviewer disagrees with the reference answer itself. The Debrief shows
// both; a disagreement puts the Question on the list «проверить опорный ответ».
import type { Attempt, ReferenceAnswer } from "./interview.ts";

/** What the interviewer says of the reference answer in `record_attempt`. */
export interface ReferenceVerdict {
  /** The numbers of the key points the answer covered, from 1. */
  readonly coveredPoints?: readonly number[] | undefined;
  /** Why the reference answer is wrong or incomplete; only when the interviewer disagrees. */
  readonly disagreement?: string | undefined;
}

type ReferenceFields = Pick<Attempt, "referencePoints" | "referenceDisagreement">;

/**
 * The Attempt's reference fields, or the rule the verdict breaks, for the agent: a Question with a
 * reference answer needs `coveredPoints` within its key points, and one without takes neither field.
 */
export function referenceFields(
  reference: ReferenceAnswer | null,
  { coveredPoints, disagreement }: ReferenceVerdict,
): { readonly fields: ReferenceFields } | { readonly problem: string } {
  if (reference === null) {
    return coveredPoints === undefined && disagreement === undefined
      ? { fields: { referencePoints: null, referenceDisagreement: null } }
      : {
          problem:
            "This question has no reference answer: leave coveredPoints and disagreement out and judge the answer from your own knowledge.",
        };
  }
  if (coveredPoints === undefined) {
    return {
      problem:
        "This question has a reference answer: give coveredPoints, the numbers of its key points the answer covered, or [] when it covered none.",
    };
  }
  const count = reference.points.length;
  if (coveredPoints.some((number) => !Number.isInteger(number) || number < 1 || number > count)) {
    return {
      problem: `coveredPoints holds the numbers of the reference answer's key points, from 1 to ${count}.`,
    };
  }
  return {
    fields: {
      referencePoints: reference.points.map((text, index) => ({
        text,
        covered: coveredPoints.includes(index + 1),
      })),
      referenceDisagreement: disagreement ?? null,
    },
  };
}
