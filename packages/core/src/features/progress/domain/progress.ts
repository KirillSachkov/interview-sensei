// Progress of a Target (#9): the Topic status of each Topic and the Readiness, computed from the
// Attempts of every Mock interview. Nothing here is stored; the server passes the Attempts in.

/** How well the Candidate knows a Topic: «не начато», «шатко» or «уверенно». */
export type TopicStatus = "not_started" | "shaky" | "confident";

/** One Attempt as progress counts it, with its Grade after the latest Dispute. */
export interface TopicAttempt {
  readonly topicId: string;
  readonly interviewId: string;
  readonly grade: 0 | 1 | 2 | 3;
  readonly hinted: boolean;
  /** `skip`: the Candidate pressed «Не знаю». */
  readonly gradedBy: "agent" | "quiz" | "skip";
  /** The Attempt answers a Deeper question. */
  readonly deeper: boolean;
  /** ISO 8601. */
  readonly recordedAt: string;
}

/** The latest Attempts that decide whether a Topic is confident. */
const recentCount = 2;
/** The lowest Grade of a strong Attempt. */
const strongGrade = 2;

const isStrong = (attempt: TopicAttempt) => attempt.grade >= strongGrade && !attempt.hinted;

/** The Attempts from the earliest to the latest; Attempts recorded at the same time keep their order. */
function chronological(attempts: readonly TopicAttempt[]): readonly TopicAttempt[] {
  return attempts.toSorted((left, right) => left.recordedAt.localeCompare(right.recordedAt));
}

/**
 * The Topic status from the Attempts on one Topic. «Уверенно»: the latest two Attempts are strong
 * (a Grade of 2 or more, no hint), at least one of them is not a quiz and at least one of them
 * answers a Deeper question. «Шатко» otherwise; «не начато» without Attempts.
 */
export function topicStatus(attempts: readonly TopicAttempt[]): TopicStatus {
  if (attempts.length === 0) {
    return "not_started";
  }
  const recent = chronological(attempts).slice(-recentCount);
  return recent.length === recentCount &&
    recent.every((attempt) => isStrong(attempt)) &&
    recent.some((attempt) => attempt.gradedBy !== "quiz") &&
    recent.some((attempt) => attempt.deeper)
    ? "confident"
    : "shaky";
}

/** The Target's Interview plan as progress reads it. */
export interface ProgressPlan {
  readonly sections: readonly {
    readonly id: string;
    readonly enabled: boolean;
    readonly topics: readonly { readonly id: string; readonly name: string }[];
  }[];
}

/** A Topic of the plan with its Topic status; `enabled` when an enabled Section checks it. */
export interface TopicProgress {
  readonly id: string;
  readonly name: string;
  readonly status: TopicStatus;
  readonly enabled: boolean;
  /** The Sections that check the Topic, in the plan's order. */
  readonly sectionIds: readonly string[];
}

/** How many Topics of the enabled Sections have each Topic status; Readiness is `confident / total`. */
interface Readiness {
  readonly confident: number;
  readonly shaky: number;
  readonly notStarted: number;
  readonly total: number;
}

export interface TargetProgress {
  readonly readiness: Readiness;
  readonly topics: readonly TopicProgress[];
  /** The Topics «подтянуть в первую очередь». */
  readonly focus: readonly TopicProgress[];
}

/** How many Topics the Candidate should work on first. */
const focusCount = 3;

/** The Topics of the plan, each once, in the plan's order. */
function planTopics(plan: ProgressPlan) {
  const topics = new Map<string, { name: string; enabled: boolean; sectionIds: string[] }>();
  for (const section of plan.sections) {
    for (const { id, name } of section.topics) {
      const entry = topics.get(id) ?? { name, enabled: false, sectionIds: [] };
      entry.enabled ||= section.enabled;
      entry.sectionIds.push(section.id);
      topics.set(id, entry);
    }
  }
  return topics;
}

function byTopic(attempts: readonly TopicAttempt[]): Map<string, TopicAttempt[]> {
  const grouped = new Map<string, TopicAttempt[]>();
  for (const attempt of chronological(attempts)) {
    grouped.set(attempt.topicId, [...(grouped.get(attempt.topicId) ?? []), attempt]);
  }
  return grouped;
}

function readinessOf(topics: readonly TopicProgress[]): Readiness {
  const enabled = topics.filter((topic) => topic.enabled);
  const count = (status: TopicStatus) => enabled.filter((topic) => topic.status === status).length;
  return {
    confident: count("confident"),
    shaky: count("shaky"),
    notStarted: count("not_started"),
    total: enabled.length,
  };
}

/**
 * The Topics «подтянуть в первую очередь»: shaky ones, the longest untouched first, then not
 * started ones in the plan's order; only Topics of enabled Sections.
 */
function focusOf(
  topics: readonly TopicProgress[],
  attempts: ReadonlyMap<string, readonly TopicAttempt[]>,
): readonly TopicProgress[] {
  const enabled = topics.filter((topic) => topic.enabled);
  const lastAt = (topic: TopicProgress) => attempts.get(topic.id)?.at(-1)?.recordedAt ?? "";
  const shaky = enabled
    .filter((topic) => topic.status === "shaky")
    .toSorted((left, right) => lastAt(left).localeCompare(lastAt(right)));
  const notStarted = enabled.filter((topic) => topic.status === "not_started");
  return [...shaky, ...notStarted].slice(0, focusCount);
}

/** The progress of a Target from the Attempts of all its Mock interviews. */
export function targetProgress(
  plan: ProgressPlan,
  attempts: readonly TopicAttempt[],
): TargetProgress {
  const grouped = byTopic(attempts);
  const topics = [...planTopics(plan)].map(([id, entry]) => ({
    id,
    name: entry.name,
    status: topicStatus(grouped.get(id) ?? []),
    enabled: entry.enabled,
    sectionIds: entry.sectionIds,
  }));
  return { readiness: readinessOf(topics), topics, focus: focusOf(topics, grouped) };
}

/** A Topic status change of the summary Debrief. */
export interface TopicChange {
  readonly id: string;
  /** Null for a Topic the plan no longer has. */
  readonly name: string | null;
  readonly before: TopicStatus;
  readonly after: TopicStatus;
}

/**
 * The Topic status changes of one Mock interview, for the Topics it has Attempts on, in the order
 * it asked them: before it, from the earlier Attempts, and after it, with its own Attempts too.
 */
export function interviewChanges(
  plan: ProgressPlan,
  attempts: readonly TopicAttempt[],
  interviewId: string,
): readonly TopicChange[] {
  const ordered = chronological(attempts);
  const first = ordered.findIndex((attempt) => attempt.interviewId === interviewId);
  const last = ordered.findLastIndex((attempt) => attempt.interviewId === interviewId);
  const before = byTopic(ordered.slice(0, first));
  const after = byTopic(ordered.slice(0, last + 1));
  // Without Attempts in the Mock interview, `first` is -1 and nothing was asked.
  const asked = new Set(ordered.slice(first, last + 1).map((attempt) => attempt.topicId));
  const names = planTopics(plan);
  return [...asked].map((id) => ({
    id,
    name: names.get(id)?.name ?? null,
    before: topicStatus(before.get(id) ?? []),
    after: topicStatus(after.get(id) ?? []),
  }));
}
