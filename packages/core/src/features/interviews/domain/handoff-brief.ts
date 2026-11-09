// The Handoff brief of a Side thread (#80) and the server's texts for its agent. The server builds
// the brief from stored data, never from the agent's log.
import type { AskedQuestion, Judgment } from "./interview.ts";
import type { TargetPlan } from "./ports.ts";
import type { SideThread } from "./side-thread.ts";

/** The Section and Topic names of the asked question in the Target's plan. */
function sectionAndTopicOf(plan: TargetPlan, question: AskedQuestion) {
  const section = plan.sections.find((entry) => entry.id === question.sectionId);
  const topic = section?.topics.find((entry) => entry.id === question.topicId);
  return { section: section?.name ?? null, topic: topic?.name ?? null };
}

/** The Candidate's answer as the brief gives it: the text, the chosen options' texts, or «Не знаю». */
function answerOf(question: AskedQuestion) {
  const { answer } = question;
  if (answer === null) {
    return null;
  }
  const chosen = question.options.filter((option) => answer.optionIds.includes(option.id));
  return {
    text: answer.text,
    chosenOptions: chosen.map((option) => option.text),
    skipped: answer.skipped,
  };
}

/**
 * The Debrief of the question's Attempt for the brief, only once the Candidate opened it: the Grade
 * after the latest Dispute, the gaps, the justification and the strong answer. Null before.
 */
function debriefOf(question: AskedQuestion, judgment: Judgment | null) {
  if (!question.debriefOpened || judgment === null) {
    return null;
  }
  const { grade, gaps, justification, strongAnswer } = judgment;
  return { grade, gaps, justification, strongAnswer };
}

/**
 * The Handoff brief for `get_brief` of a Side thread: where it opened, the Target, the question,
 * the Candidate's answer and Follow-ups when there are any, the Debrief once the Candidate opened
 * it, the selected fragment and the Candidate's question. It holds no correct quiz option and no
 * history of the rest of the Mock interview. `judgment` is the Attempt's, with the Grade after the
 * latest Dispute; null without an Attempt.
 */
export function handoffBrief(
  thread: SideThread,
  {
    plan,
    question,
    judgment,
  }: { plan: TargetPlan; question: AskedQuestion; judgment: Judgment | null },
) {
  return {
    origin: thread.origin.kind,
    target: { name: plan.name, level: plan.level },
    language: plan.language,
    question: {
      number: question.position + 1,
      text: question.text,
      format: question.format,
      options: question.options.map((option) => option.text),
      ...sectionAndTopicOf(plan, question),
    },
    answer: answerOf(question),
    followUps: question.followUps.map(({ question: asked, answer }) => ({
      question: asked,
      answer,
    })),
    debrief: debriefOf(question, judgment),
    fragment: thread.fragment,
    candidateQuestion: thread.question,
  };
}

/** The server's first message to the agent of a Side thread opened with the Candidate's question. */
export const sideThreadOpened = [
  "The Candidate opened a side thread from a mock interview.",
  "Call get_brief, then answer the Candidate's question from it, candidateQuestion, in the brief's language.",
].join(" ");

/** The addition to the Side thread agent's role: the Target's language. */
export function sideThreadRole({ language }: Pick<TargetPlan, "language">): string {
  return [
    `Every text you write goes to the Candidate's chat: write it only in the language with the code "${language}".`,
    "Never describe your plan, steps, tools or skill in the chat.",
  ].join(" ");
}
