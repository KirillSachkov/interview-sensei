// The limit of questions in a row on one Topic (#64): at most three, Deeper questions included, and
// one more for a shaky Topic. Then the interview moves to another Topic.
import type { TopicStatus } from "./ports.ts";

/** At most this many questions in a row on one Topic. */
const streakLimit = 3;
/** A shaky Topic gets one question more. */
const shakyExtra = 1;

/** The limit of questions in a row on a Topic of this status. */
export function topicStreakLimit(status: TopicStatus): number {
  return status === "shaky" ? streakLimit + shakyExtra : streakLimit;
}

/**
 * The Topic whose questions in a row at the end of `asked` reached its limit; undefined when the
 * last Topic may get one more. `asked` holds the Mock interview's questions in the order of showing.
 */
export function fullTopic(
  asked: readonly { readonly topicId: string }[],
  statusOf: (topicId: string) => TopicStatus,
): string | undefined {
  const last = asked.at(-1)?.topicId;
  if (last === undefined) {
    return undefined;
  }
  const lastOther = asked.findLastIndex((entry) => entry.topicId !== last);
  const streak = asked.length - 1 - lastOther;
  return streak >= topicStreakLimit(statusOf(last)) ? last : undefined;
}
