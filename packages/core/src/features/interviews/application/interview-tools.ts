// The MCP tools of the `mock-interview` session kind (#10). Each acts only on the Mock interview of
// the session that calls it.
import { z } from "zod";

import { sessionTool } from "../../../shared/mcp/index.ts";
import type { SessionTool } from "../../../shared/mcp/index.ts";
import { grades } from "../domain/interview.ts";
import type { Interviews } from "./interviews.ts";
import { questionTools } from "./question-tools.ts";

const judgment = z.strictObject({
  grade: z.literal(grades),
  gaps: z.string().describe("What the answer missed or got wrong; empty when nothing."),
  justification: z
    .string()
    .min(1)
    .describe("Why the answer gets this Grade, in one or two sentences."),
  strongAnswer: z.string().min(1).describe("An outline of a strong answer."),
});

export function interviewTools({ interviewer }: Interviews): readonly SessionTool[] {
  return [
    sessionTool({
      name: "get_brief",
      description:
        "Returns the brief of this mock interview as JSON: the Target, the selected Sections with their grading criteria and Topics, the tone, the language, the active Preferences, the time limit and questionLevel, the level to start the questions at, the last mock interview's summary, the weak Topics, and the Candidate's corrections of earlier Grades. Treat the corrections as calibration: grade similar answers the way the Candidate corrected them. Call it once at the start.",
      input: z.strictObject({}),
      run: async (_input, session) => interviewer.brief(session.sessionId),
    }),
    ...questionTools(interviewer),
    sessionTool({
      name: "ask_follow_up",
      description:
        "Shows a Follow-up under the Candidate's answer to the presented question: a clarification such as «what did you mean» or «give an example». At most two per question; they belong to its Attempt. After this call, end your turn and wait for the Candidate's answer.",
      input: z.strictObject({
        question: z.string().min(1).describe("The Follow-up, in the Target's language."),
      }),
      run: async (input, session) => interviewer.askFollowUp(session.sessionId, input),
    }),
    sessionTool({
      name: "record_attempt",
      description:
        "Records your judgment of the Candidate's answer to the presented question, with its Follow-ups: the Grade from 0 to 3, the gaps, a short justification and an outline of a strong answer. The app records the answer itself, and records quizzes and «Не знаю» without you. One Attempt per question; it never changes. Returns the Attempt's id.",
      input: judgment,
      run: async (input, session) => interviewer.record(session.sessionId, input),
    }),
    sessionTool({
      name: "finish_interview",
      description:
        "Ends the mock interview after the Candidate finished it: a short summary of the interview and the next step, in the Target's language.",
      input: z.strictObject({ summary: z.string().min(1), nextStep: z.string().min(1) }),
      run: async (input, session) => interviewer.finish(session.sessionId, input),
    }),
  ];
}
