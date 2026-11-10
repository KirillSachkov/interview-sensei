// The question selection rules, v2 (#8, #64): the code ranks the candidates and gives each its
// reasons, the agent picks and shows one. The weights were tuned on the unit tests in
// candidates.test.ts; the issues leave their values to the tests.
import { levels } from "./interview.ts";
import type { Difficulty, Level, PastQuestion } from "./interview.ts";
import type { BankQuestion, TopicImportance, TopicStatus } from "./ports.ts";
import { fullTopic } from "./topic-streak.ts";

const shifts: Readonly<Record<Difficulty, number>> = { easier: -1, as_is: 0, harder: 1 };

/**
 * The level of the candidates: the Target's level, middle without one, shifted one step down or up
 * by the difficulty and kept within junior and senior.
 */
export function candidateLevel(targetLevel: Level | null, difficulty: Difficulty): Level {
  const index = levels.indexOf(targetLevel ?? "middle") + shifts[difficulty];
  return levels[Math.min(Math.max(index, 0), levels.length - 1)] ?? "middle";
}

/** How many candidates the agent gets. */
const candidateCount = 5;

/** The Topic's importance for the Target. */
const importancePriority: Readonly<Record<TopicImportance, number>> = {
  high: 2,
  normal: 0,
  low: -1,
};
/** The Topic status: a Topic without Attempts comes first, a shaky one before a confident one. */
const statusWeights: Readonly<Record<TopicStatus, number>> = {
  not_started: 3,
  shaky: 1.5,
  confident: 0,
};
/** Per point that the mean of a Topic's two latest Grades falls short of 3. */
const weaknessWeight = 1;
/** A Topic not asked for this long gets the whole staleness weight. */
const staleAfterMs = 7 * 86_400_000;
const stalenessWeight = 2;
/** A Topic of the plan not asked in this Mock interview yet: the interview covers the plan. */
const uncoveredWeight = 1.5;
/**
 * A Question whose last Grade is 0 or 1 goes above a new Question of the same Topic: the weight
 * outweighs the largest level penalty (two steps) together with 👍.
 */
const retryWeight = 4;
/** 👍 lifts a Question a little. */
const usefulWeight = 0.5;
/** Per level step between a Question and the wanted level. */
const levelWeight = 1.5;
/** How many of a Topic's latest Grades its weakness counts. */
const recentGrades = 2;
/** The highest Grade that brings a Question back in the next Mock interview with priority. */
const retryGrade = 1;

/**
 * How many of the Target's next Mock interviews a Question rests after its last Grade: 3 skips two
 * of them, 2 skips one, 0 and 1 («Не знаю» included) skip none.
 */
const restAfterGrade: Readonly<Record<0 | 1 | 2 | 3, number>> = { 0: 0, 1: 0, 2: 1, 3: 2 };

/** Why a candidate is in the list; the agent reads them as they are. */
type CandidateReason =
  | "retry after a mistake"
  | "weak topic"
  | "topic not started"
  | "important topic"
  | "not asked for a long time"
  | "topic not covered in this interview yet"
  | "best of the rest";

const byTime = (left: PastQuestion, right: PastQuestion) =>
  Date.parse(left.presentedAt) - Date.parse(right.presentedAt);

/** The time since the Topic was last asked, in milliseconds; null when it never was. */
function sinceAsked(asked: readonly PastQuestion[], now: string): number | null {
  const last = asked.at(-1);
  return last === undefined ? null : Math.max(Date.parse(now) - Date.parse(last.presentedAt), 0);
}

/** Up to the whole staleness weight, by the time since the Topic was last asked. */
function staleness(since: number | null): number {
  return stalenessWeight * Math.min((since ?? staleAfterMs) / staleAfterMs, 1);
}

/** How far the Topic's latest Grades fall short of 3; none without Grades. */
function weakness(asked: readonly PastQuestion[]): number {
  const grades = asked.flatMap((entry) => (entry.grade === null ? [] : [entry.grade]));
  if (grades.length === 0) {
    return 0;
  }
  const latest = grades.slice(-recentGrades);
  const mean = latest.reduce<number>((sum, grade) => sum + grade, 0) / latest.length;
  return weaknessWeight * (3 - mean);
}

/** A Topic of the plan as the selection reads it; a Topic missing here is normal and not started. */
export interface CandidateTopic {
  readonly importance: TopicImportance;
  readonly status: TopicStatus;
}

const plainTopic: CandidateTopic = { importance: "normal", status: "not_started" };

/** The Topic as the selection reads it; normal and not started when the plan does not list it. */
export function topicOf(
  topics: ReadonlyMap<string, CandidateTopic>,
  topicId: string,
): CandidateTopic {
  return topics.get(topicId) ?? plainTopic;
}

/** The priority of a Topic and its reasons. */
interface TopicScore {
  readonly priority: number;
  readonly reasons: readonly CandidateReason[];
}

function topicReasons(
  { importance, status }: CandidateTopic,
  { since, covered }: { since: number | null; covered: boolean },
): readonly CandidateReason[] {
  return [
    ...(status === "shaky" ? (["weak topic"] as const) : []),
    ...(status === "not_started" ? (["topic not started"] as const) : []),
    ...(importance === "high" ? (["important topic"] as const) : []),
    ...(since !== null && since >= staleAfterMs ? (["not asked for a long time"] as const) : []),
    ...(covered ? [] : (["topic not covered in this interview yet"] as const)),
  ];
}

/**
 * The score of each Topic: its importance, Topic status, weakness by its latest Grades, the time
 * since it was asked and whether this Mock interview has asked it yet.
 */
function topicScores(request: CandidateRequest) {
  const ordered = request.history.toSorted(byTime);
  const scores = new Map<string, TopicScore>();
  return (topicId: string): TopicScore => {
    const known = scores.get(topicId);
    if (known !== undefined) {
      return known;
    }
    const topic = topicOf(request.topics, topicId);
    const asked = ordered.filter((entry) => entry.topicId === topicId);
    const since = sinceAsked(asked, request.now);
    const covered = asked.some((entry) => entry.interviewId === request.interviewId);
    const score = {
      priority:
        importancePriority[topic.importance] +
        statusWeights[topic.status] +
        weakness(asked) +
        staleness(since) +
        (covered ? 0 : uncoveredWeight),
      reasons: topicReasons(topic, { since, covered }),
    };
    scores.set(topicId, score);
    return score;
  };
}

/** The last graded showing of each Question. */
function lastGraded(history: readonly PastQuestion[]): ReadonlyMap<string, PastQuestion> {
  const last = new Map<string, PastQuestion>();
  for (const entry of history.toSorted(byTime)) {
    if (entry.grade !== null) {
      last.set(entry.questionId, entry);
    }
  }
  return last;
}

/** Whether the Question still rests after its last Grade; see restAfterGrade. */
function resting(entry: PastQuestion | undefined, recentInterviewIds: readonly string[]): boolean {
  if (entry === undefined || entry.grade === null) {
    return false;
  }
  return recentInterviewIds.slice(0, restAfterGrade[entry.grade]).includes(entry.interviewId);
}

export interface CandidateRequest {
  /** The Target's Questions of the current Section's Topics. */
  readonly questions: readonly BankQuestion[];
  /** The importance and Topic status of the Target's Topics. */
  readonly topics: ReadonlyMap<string, CandidateTopic>;
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
}

/** A candidate with the reasons it is in the list, at least one. */
export interface Candidate {
  readonly question: BankQuestion;
  readonly reasons: readonly CandidateReason[];
}

/** The Topic that had its limit of questions in a row in this Mock interview, if any. */
function fullTopicOf({ history, interviewId, topics }: CandidateRequest): string | undefined {
  const asked = history.filter((entry) => entry.interviewId === interviewId).toSorted(byTime);
  return fullTopic(asked, (topicId) => topicOf(topics, topicId).status);
}

/**
 * The 5 Questions the agent may show next, the most needed first, each with its reasons. Left out:
 * hidden Questions, those rated 👎 or ⚠, those asked in this Mock interview, those still resting
 * after their last Grade (3 for two Mock interviews, 2 for one), and the Topic that had its limit of
 * questions in a row. The priority adds the Topic's score; a Question whose last Grade is 0 or 1
 * goes above the new ones of its Topic, 👍 adds a little, and each level step away from the wanted
 * level takes some.
 */
export function questionCandidates(request: CandidateRequest): readonly Candidate[] {
  const { questions, interviewId, history, level, recentInterviewIds } = request;
  const asked = new Set(
    history.filter((entry) => entry.interviewId === interviewId).map((entry) => entry.questionId),
  );
  const graded = lastGraded(history);
  const full = fullTopicOf(request);
  const topic = topicScores(request);
  const scored = (question: BankQuestion): Candidate & { readonly priority: number } => {
    const last = graded.get(question.id);
    const retry = last?.grade !== undefined && last.grade !== null && last.grade <= retryGrade;
    const { priority, reasons } = topic(question.topicId);
    const all: readonly CandidateReason[] = [
      ...(retry ? (["retry after a mistake"] as const) : []),
      ...reasons,
    ];
    return {
      question,
      reasons: all.length === 0 ? ["best of the rest"] : all,
      priority:
        priority +
        (retry ? retryWeight : 0) +
        (question.rating === "useful" ? usefulWeight : 0) -
        levelWeight * Math.abs(levels.indexOf(question.level) - levels.indexOf(level)),
    };
  };
  return questions
    .filter(
      (question) =>
        !question.hidden &&
        question.rating !== "irrelevant" &&
        question.rating !== "wrong" &&
        question.topicId !== full &&
        !asked.has(question.id) &&
        !resting(graded.get(question.id), recentInterviewIds),
    )
    .map((question) => scored(question))
    .toSorted((left, right) => right.priority - left.priority)
    .slice(0, candidateCount)
    .map(({ question, reasons }) => ({ question, reasons }));
}
