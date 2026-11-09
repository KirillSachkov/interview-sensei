import type { TargetPlan } from "./ports.ts";

const tones: Readonly<Record<TargetPlan["tone"], string>> = {
  friendly: "friendly: warm and encouraging, while still strict about the Grades",
  neutral: "neutral: calm and matter-of-fact, like a typical interviewer",
  strict: "strict: brief and demanding, like a tough interviewer",
};

/**
 * The addition to the interviewer's role: the Target's tone and language (#10). Every text of the
 * agent reaches the Candidate's chat, so it also keeps the agent's working notes out of it.
 */
export function interviewerRole({ tone, language }: Pick<TargetPlan, "tone" | "language">): string {
  return [
    `The interview tone is ${tones[tone]}.`,
    `Every text you write goes to the Candidate's chat: write it only in the language with the code "${language}".`,
    "Never describe your plan, steps, tools or skill in the chat.",
    "When you have nothing to tell the Candidate, such as before or between tool calls, write no text at all.",
  ].join(" ");
}
