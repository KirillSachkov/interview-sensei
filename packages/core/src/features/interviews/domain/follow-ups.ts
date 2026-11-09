import type { AskedQuestion, FollowUp } from "./interview.ts";

/** The most Follow-ups the agent may ask on one presented question (#41). */
export const maxFollowUps = 2;

/** The agent's last Follow-up while the Candidate has not answered it. */
export function pendingFollowUp(question: Pick<AskedQuestion, "followUps">): FollowUp | undefined {
  const last = question.followUps.at(-1);
  return last?.answer === null ? last : undefined;
}
