// What the agent of a Target setup session learns from get_brief and its first prompt.
import type { DraftChange } from "./draft.ts";
import type { SetupTarget } from "./ports.ts";

/**
 * The application's first prompt to the agent of a draft Target: the agent speaks first and
 * starts the onboarding without waiting for the Candidate.
 */
export const onboardingPrompt =
  "Start the onboarding of this Target now: call get_brief, then ask the Candidate your first question.";

/** The Target without ids, as the agent reads it in the brief. */
function targetText(target: SetupTarget): string {
  return JSON.stringify({
    name: target.name,
    level: target.level,
    tone: target.tone,
    language: target.language,
    status: target.status,
    sections: target.sections.map((section) => ({
      name: section.name,
      kind: section.kind,
      gradingCriteria: section.gradingCriteria,
      enabled: section.enabled,
      topics: section.topics.map((topic) => topic.name),
    })),
  });
}

/** The Candidate's active Preferences and the draft's changes with their ids, for the agent. */
function draftText(target: SetupTarget, changes: readonly DraftChange[]): string[] {
  const preferences = target.preferences.map(({ id, text }) => ({ id, text }));
  return [
    `Active Preferences: ${JSON.stringify(preferences)}`,
    `The draft of changes, ${changes.length} not applied: ${JSON.stringify(
      changes.map(({ id, operation }) => ({ id, operation })),
    )}`,
  ];
}

/**
 * The brief of the Target setup session: its mode, how to change the Target, the Target, its
 * active Preferences and its draft of changes.
 */
export function setupBrief(target: SetupTarget, changes: readonly DraftChange[]): string {
  const mode =
    target.status === "draft"
      ? [
          "Mode: onboarding. The Target is a new draft: start with questions.",
          "Ask which position and level the Candidate prepares for, then ask for the vacancy, the resume and their experience.",
          "Then build the Target's name, level, Sections and Topics yourself.",
        ]
      : ["Mode: editing. The Target is set up: ask the Candidate what to change."];
  return [
    "This is the Target setup session of Interview Sensei.",
    ...mode,
    "Record every change in the draft of changes with update_target, set_interview_plan, save_preference, add_questions and edit_questions; the Candidate sees the draft above the chat input.",
    "get_draft lists the draft; remove_draft_change and discard_draft take changes back.",
    "Call apply_changes only after the Candidate explicitly agrees.",
    `The Target now: ${targetText(target)}`,
    ...draftText(target, changes),
  ].join("\n");
}
