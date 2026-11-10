import type { ContinuationSummary } from "./continuation.ts";
import type { GradeCorrection } from "./history.ts";
import { candidateLevel } from "./candidates.ts";
import type { MockInterview } from "./interview.ts";
import type { TargetPlan } from "./ports.ts";
import { sectionShares } from "./section-shares.ts";

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
 * criteria, shares and Topics with their importance, the tone, the language, the active Preferences, the last Mock interview's
 * summary, the weak Topics and the Candidate's Grade corrections. After a pause it also holds the
 * continuation summary (#84); a Mock interview never paused has none.
 */
export function interviewBrief(
  interview: MockInterview,
  target: TargetPlan,
  past: BriefHistory & { readonly continuation?: ContinuationSummary },
) {
  const selected = interview.sectionIds.flatMap((id) =>
    target.sections.filter((section) => section.id === id),
  );
  const shares = sectionShares(selected);
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
    sections: selected.map((section, index) => {
      const share = shares[index]?.share ?? 0;
      return {
        id: section.id,
        name: section.name,
        kind: section.kind,
        gradingCriteria: section.gradingCriteria,
        /** The Section's part of the interview, in percent. */
        sharePercent: Math.round(share * 100),
        /** Its part of the time limit in whole minutes; null without a limit. */
        minutes:
          interview.limitMinutes === null ? null : Math.round(share * interview.limitMinutes),
        topics: section.topics.map(({ id, name, importance }) => ({ id, name, importance })),
      };
    }),
    ...past,
  };
}
