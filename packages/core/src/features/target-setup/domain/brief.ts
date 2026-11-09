// What the agent of a Target setup session learns from get_brief and its first prompt.
import type { DraftChange } from "./draft.ts";
import type { SetupTarget } from "./ports.ts";

/**
 * The application's first prompt to the agent of a draft Target: the agent speaks first and
 * starts the onboarding without waiting for the Candidate. It is in Russian, as the Candidate
 * would write it; «Session profiles» in CODING_STANDARDS.md gives the reason.
 */
export const onboardingPrompt =
  "Начни настройку новой цели: вызови get_brief и задай мне первый вопрос.";

/**
 * The application's first prompt to the agent of a setup session that continues an earlier one
 * (#85), such as after a restart. In Russian for the reason of `onboardingPrompt`.
 */
export const continuationPrompt =
  "Продолжим настройку цели: вызови get_brief, посмотри черновик и наши последние сообщения и коротко скажи, на чём мы остановились.";

/** How many of the earlier conversation's last messages the brief of a continued session holds. */
const lastMessagesInBrief = 20;

/** One message of the earlier setup conversation. */
export interface SetupMessage {
  readonly from: "candidate" | "agent";
  readonly text: string;
}

/** The lines about the earlier conversation in the brief of a continued session; none without one. */
function continuationText(earlier: readonly SetupMessage[]): string[] {
  if (earlier.length === 0) {
    return [];
  }
  return [
    "This session continues an earlier setup session that stopped, such as at a restart of the app: go on from where the conversation stopped and do not start over.",
    `The last messages of that conversation, oldest first: ${JSON.stringify(
      earlier.slice(-lastMessagesInBrief),
    )}`,
  ];
}

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
 * active Preferences and its draft of changes; for a session that continues an earlier one, the
 * last messages of the earlier conversation.
 */
export function setupBrief(
  target: SetupTarget,
  changes: readonly DraftChange[],
  earlier: readonly SetupMessage[] = [],
): string {
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
    ...continuationText(earlier),
  ].join("\n");
}
