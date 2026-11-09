// The MCP tools of the `mock-interview` session kind (#10). Each acts only on the Mock interview of
// the session that calls it.
import { z } from "zod";

import { sessionTool } from "../../../shared/mcp/index.ts";
import type { SessionTool } from "../../../shared/mcp/index.ts";
import type { Interviews } from "./interviews.ts";

const judgment = z.strictObject({
  grade: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]),
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
        "Returns the brief of this mock interview as JSON: the Target, the selected Sections with their grading criteria and Topics, the tone, the language and the active Preferences. Call it once at the start.",
      input: z.strictObject({}),
      run: async (_input, session) => interviewer.brief(session.sessionId),
    }),
    sessionTool({
      name: "next_question_candidates",
      description:
        "Returns Questions you may show next, from the current Section, as JSON. Questions already asked in this mock interview are left out. Pick one and show it with present_question.",
      input: z.strictObject({ limit: z.number().int().min(1).max(20).default(10) }),
      run: async ({ limit }, session) => interviewer.candidates(session.sessionId, limit),
    }),
    sessionTool({
      name: "present_question",
      description:
        "Shows the Question to the Candidate as a card. Only one question is shown at a time: the next one needs the Attempt of the current one. After this call, end your turn and wait for the Candidate's answer.",
      input: z.strictObject({ questionId: z.uuid() }),
      run: async (input, session) => interviewer.present(session.sessionId, input),
    }),
    sessionTool({
      name: "record_attempt",
      description:
        "Records your judgment of the Candidate's answer to the presented question: the Grade from 0 to 3, the gaps, a short justification and an outline of a strong answer. The app records the answer itself. One Attempt per question; it never changes.",
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
