// The shares of the selected Sections in a Mock interview (#64): a Section gets more of the
// interview the more Topics it has and the more they matter. With a time limit the share is in
// minutes; without one, in questions out of each round of ten. The server suggests the move to the
// next Section by the share; the agent decides.
import type { PlanSection, TopicImportance } from "./ports.ts";

/** What a Topic of each importance adds to its Section's weight. */
const sectionWeights: Readonly<Record<TopicImportance, number>> = {
  high: 2,
  normal: 1,
  low: 0.5,
};
/** A Section without Topics, such as a conversation, weighs as one normal Topic. */
const emptySectionWeight = 1;
/** Without a time limit, the shares split each round of this many questions. */
const questionRound = 10;

type SharedSection = Pick<PlanSection, "id" | "topics">;

function weight(section: SharedSection): number {
  return section.topics.length === 0
    ? emptySectionWeight
    : section.topics.reduce((sum, topic) => sum + sectionWeights[topic.importance], 0);
}

/** The share of each Section, in their order, from 0 to 1; together they make 1. */
export function sectionShares(
  sections: readonly SharedSection[],
): readonly { readonly id: string; readonly share: number }[] {
  const total = sections.reduce((sum, section) => sum + weight(section), 0);
  return sections.map((section) => ({ id: section.id, share: weight(section) / total }));
}

/** The Section whose part of the interview `position` falls in, by the shares in their order. */
function sectionAt(
  shares: readonly { readonly id: string; readonly share: number }[],
  position: number,
): string | undefined {
  let end = 0;
  for (const { id, share } of shares) {
    end += share;
    if (position < end) {
      return id;
    }
  }
  return shares.at(-1)?.id;
}

/** Where the Mock interview is: the running time with a limit, the asked questions without one. */
export type InterviewPace =
  | { readonly limitMinutes: number; readonly runningMinutes: number }
  | { readonly limitMinutes: null; readonly askedCount: number };

/**
 * The Section the plan puts the Mock interview in now, when it is not the current one; undefined
 * when the current Section still has its share. With a limit the plan only moves forward: past its
 * end the last Section stays. Without one each round of ten questions goes through the Sections
 * again.
 */
export function suggestedSection(
  sections: readonly SharedSection[],
  { currentSectionId, pace }: { currentSectionId: string | null; pace: InterviewPace },
): string | undefined {
  const shares = sectionShares(sections);
  const order = shares.map((entry) => entry.id);
  const planned =
    pace.limitMinutes === null
      ? sectionAt(shares, (pace.askedCount % questionRound) / questionRound)
      : sectionAt(shares, pace.runningMinutes / pace.limitMinutes);
  if (planned === undefined || planned === currentSectionId) {
    return undefined;
  }
  const forward =
    currentSectionId === null || order.indexOf(planned) > order.indexOf(currentSectionId);
  return pace.limitMinutes === null || forward ? planned : undefined;
}
