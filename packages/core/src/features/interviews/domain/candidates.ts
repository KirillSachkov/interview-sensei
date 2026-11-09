// The question selection rules (#8): the code ranks the candidates, the agent picks and shows one.
// The weights were tuned on the unit tests in candidates.test.ts; the spec leaves their values to
// the tests.
import { levels } from "./interview.ts";
import type { Difficulty, Level, PastQuestion } from "./interview.ts";
import type { BankQuestion } from "./ports.ts";

const shifts: Readonly<Record<Difficulty, number>> = { easier: -1, as_is: 0, harder: 1 };

/**
 * The level of the candidates: the Target's level, middle without one, shifted one step down or up
 * by the difficulty and kept within junior and senior.
 */
export function candidateLevel(targetLevel: Level | null, difficulty: Difficulty): Level {
  const index = levels.indexOf(targetLevel ?? "middle") + shifts[difficulty];
  return levels[Math.min(Math.max(index, 0), levels.length - 1)] ?? "middle";
}

/** A Topic without Attempts comes first. */
const unstartedWeight = 3;
/** Per point that the mean of a Topic's two latest Grades falls short of 3. */
const weaknessWeight = 1;
/** A Topic not asked for this long gets the whole staleness weight. */
const staleAfterMs = 7 * 86_400_000;
const stalenessWeight = 2;
/** 👍 lifts a Question a little. */
const usefulWeight = 0.5;
/** Per level step between a Question and the wanted level. */
const levelWeight = 1.5;
/** How many of a Topic's latest Grades its weakness counts. */
const recentGrades = 2;

const byTime = (left: PastQuestion, right: PastQuestion) =>
  Date.parse(left.presentedAt) - Date.parse(right.presentedAt);

/** Up to the whole staleness weight, by the time since the Topic was last asked. */
function staleness(asked: readonly PastQuestion[], now: string): number {
  const last = asked.at(-1);
  const sinceMs =
    last === undefined ? staleAfterMs : Date.parse(now) - Date.parse(last.presentedAt);
  return stalenessWeight * Math.min(Math.max(sinceMs, 0) / staleAfterMs, 1);
}

/** The unstarted weight without Grades; otherwise how far the latest Grades fall short of 3. */
function weakness(asked: readonly PastQuestion[]): number {
  const grades = asked.flatMap((entry) => (entry.grade === null ? [] : [entry.grade]));
  if (grades.length === 0) {
    return unstartedWeight;
  }
  const latest = grades.slice(-recentGrades);
  const mean = latest.reduce<number>((sum, grade) => sum + grade, 0) / latest.length;
  return weaknessWeight * (3 - mean);
}

/** The priority of each Topic from its history: weakness, staleness and whether it started. */
function topicPriority(history: readonly PastQuestion[], now: string) {
  const ordered = history.toSorted(byTime);
  return (topicId: string): number => {
    const asked = ordered.filter((entry) => entry.topicId === topicId);
    return weakness(asked) + staleness(asked, now);
  };
}

/** The Questions whose last Grade is 3 from one of the two Mock interviews before this one. */
function restingQuestions(
  history: readonly PastQuestion[],
  recentInterviewIds: readonly string[],
): ReadonlySet<string> {
  const lastGraded = new Map<string, PastQuestion>();
  for (const entry of history.toSorted(byTime)) {
    if (entry.grade !== null) {
      lastGraded.set(entry.questionId, entry);
    }
  }
  const recent = new Set(recentInterviewIds.slice(0, 2));
  return new Set(
    [...lastGraded.values()]
      .filter((entry) => entry.grade === 3 && recent.has(entry.interviewId))
      .map((entry) => entry.questionId),
  );
}

export interface CandidateRequest {
  /** The Target's Questions of the current Section's Topics. */
  readonly questions: readonly BankQuestion[];
  /** The current Mock interview. */
  readonly interviewId: string;
  /** Every Question asked in the Target's Mock interviews, this one included. */
  readonly history: readonly PastQuestion[];
  /** The Target's Mock interviews before this one, the newest first. */
  readonly recentInterviewIds: readonly string[];
  /** The wanted level; see candidateLevel. */
  readonly level: Level;
  /** ISO 8601. */
  readonly now: string;
  readonly limit: number;
}

/**
 * The Questions the agent may show next, the most needed first. Left out: hidden Questions, those
 * rated 👎 or ⚠, those asked in this Mock interview, and those whose last Grade is 3 for the next
 * two Mock interviews. The priority adds a Topic's weakness by its latest Grades, the time since
 * it was asked and whether it has no Attempts yet; 👍 adds a little, and each level step away from
 * the wanted level takes some.
 */
export function questionCandidates(request: CandidateRequest): readonly BankQuestion[] {
  const { questions, interviewId, history, level, limit } = request;
  const asked = new Set(
    history.filter((entry) => entry.interviewId === interviewId).map((entry) => entry.questionId),
  );
  const resting = restingQuestions(history, request.recentInterviewIds);
  const topic = topicPriority(history, request.now);
  const priority = (question: BankQuestion) =>
    topic(question.topicId) +
    (question.rating === "useful" ? usefulWeight : 0) -
    levelWeight * Math.abs(levels.indexOf(question.level) - levels.indexOf(level));
  return questions
    .filter(
      (question) =>
        !question.hidden &&
        question.rating !== "irrelevant" &&
        question.rating !== "wrong" &&
        !asked.has(question.id) &&
        !resting.has(question.id),
    )
    .map((question) => ({ question, priority: priority(question) }))
    .toSorted((left, right) => right.priority - left.priority)
    .slice(0, limit)
    .map(({ question }) => question);
}
