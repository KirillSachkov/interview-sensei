import type { MockInterview } from "./interview.ts";
import type { TargetPlan } from "./ports.ts";

/**
 * The brief of a Mock interview for `get_brief`: the Target, the selected Sections with their
 * criteria and Topics, the tone, the language and the active Preferences. Later slices add the last
 * Mock interview's summary, weak Topics and the Candidate's Disputes.
 */
export function interviewBrief(interview: MockInterview, target: TargetPlan) {
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
      currentSectionId: interview.currentSectionId,
    },
    sections: selected.map((section) => ({
      id: section.id,
      name: section.name,
      kind: section.kind,
      gradingCriteria: section.gradingCriteria,
      topics: section.topics.map((topic) => ({ id: topic.id, name: topic.name })),
    })),
  };
}
