import type { GradeCorrection } from "./history.ts";
import { candidateLevel } from "./candidates.ts";
import type { MockInterview } from "./interview.ts";
import type { TargetPlan } from "./ports.ts";

/** What the brief tells of the Target's earlier Mock interviews and progress. */
export interface BriefHistory {
  /** The newest earlier Mock interview that ended, with the agent's summary and next step. */
  readonly lastInterview: Pick<
    MockInterview,
    "status" | "finishedAt" | "summary" | "nextStep"
  > | null;
  /** The Topics «подтянуть в первую очередь»: shaky ones first, then not started ones. */
  readonly weakTopics: readonly {
    readonly id: string;
    readonly name: string;
    readonly status: string;
  }[];
  /** The Candidate's corrections of earlier Grades: a calibration signal for the agent. */
  readonly gradeCorrections: readonly GradeCorrection[];
}

/**
 * The brief of a Mock interview for `get_brief`: the Target, the selected Sections with their
 * criteria and Topics, the tone, the language, the active Preferences, the last Mock interview's
 * summary, the weak Topics and the Candidate's Grade corrections.
 */
export function interviewBrief(interview: MockInterview, target: TargetPlan, past: BriefHistory) {
  const selected = interview.sectionIds.flatMap((id) =>
    target.sections.filter((section) => section.id === id),
  );
  return {
    target: { name: target.name, level: target.level },
    tone: target.tone,
    language: target.language,
    preferences: target.preferences.map((preference) => preference.text),
    mockInterview: {
      limitMinutes: interview.limitMinutes,
      difficulty: interview.difficulty,
      questionLevel: candidateLevel(target.level, interview.difficulty),
      currentSectionId: interview.currentSectionId,
    },
    sections: selected.map((section) => ({
      id: section.id,
      name: section.name,
      kind: section.kind,
      gradingCriteria: section.gradingCriteria,
      topics: section.topics.map((topic) => ({ id: topic.id, name: topic.name })),
    })),
    ...past,
  };
}
