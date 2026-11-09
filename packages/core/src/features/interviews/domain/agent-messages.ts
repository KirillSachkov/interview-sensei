// The template messages the server sends the interviewer as `session/prompt` (#10). They are in
// English; the Candidate's answer goes inside as written. The fake agent's interviewer mode knows
// them by their first sentence.

export const interviewStarted = [
  "The mock interview has started.",
  "Call get_brief, pick a question with next_question_candidates and show it with present_question.",
  "Then end your turn and wait for the Candidate's answer.",
].join(" ");

/** The Candidate's free-text answer to the presented question, passed on as written. */
export function candidateAnswered(answer: string): string {
  return [
    "The Candidate answered the presented question.",
    "Judge the answer against the Section's grading criteria and call record_attempt with your judgment.",
    "Keep the Grade, gaps and strong answer out of the chat.",
    "Then present the next question.",
    "",
    "The Candidate's answer, as written:",
    "",
    answer,
  ].join("\n");
}

export const candidateFinished = [
  "The Candidate finished the mock interview.",
  "Call finish_interview with a short summary of the interview and the next step, in the Target's language.",
  "Ask no more questions.",
].join(" ");
