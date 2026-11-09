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

/** The app graded the Candidate's quiz answer itself; the agent records no Attempt for it. */
export function quizAnswered(grade: number, attemptId: string): string {
  return [
    "The Candidate answered the presented quiz.",
    `The app graded it by the quiz rule: Grade ${grade} of 3, Attempt ${attemptId}.`,
    "Do not call record_attempt for it. Keep the Grade out of the chat.",
    "Then present the next question.",
  ].join(" ");
}

/** «Не знаю»: the app recorded the Attempt with Grade 0; the agent records none. */
export function questionSkipped(attemptId: string): string {
  return [
    "The Candidate skipped the presented question with «Не знаю».",
    `The app recorded its Attempt with Grade 0 of 3, Attempt ${attemptId}.`,
    "Do not call record_attempt for it, and do not explain the answer in the chat.",
    "Then present the next question.",
  ].join(" ");
}

/** The Candidate's answer to the agent's last Follow-up, passed on as written. */
export function followUpAnswered(answer: string): string {
  return [
    "The Candidate answered your Follow-up.",
    "Ask one more Follow-up with ask_follow_up if the answer still needs it, at most two per question.",
    "Otherwise judge the whole answer with its Follow-ups and call record_attempt, then present the next question.",
    "",
    "The Candidate's answer to the Follow-up, as written:",
    "",
    answer,
  ].join("\n");
}

/** Sent 5 minutes before the time limit; the agent leads the interview to its end. */
export const fiveMinutesLeft = [
  "Five minutes of the time limit are left.",
  "Lead the interview to its end: finish the current question and ask at most one more short one.",
  "Do not finish the interview yourself: the Candidate ends it with «Завершить».",
  "If a question waits for the Candidate's answer, end your turn without a chat message.",
].join(" ");
