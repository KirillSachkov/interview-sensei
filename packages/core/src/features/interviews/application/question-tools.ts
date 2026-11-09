// The interviewer's MCP tools that choose and show the questions (#10), with the current Section.
import { z } from "zod";

import { sessionTool } from "../../../shared/mcp/index.ts";
import type { SessionTool } from "../../../shared/mcp/index.ts";
import type { Interviewer } from "./interviewer.ts";

export function questionTools(interviewer: Interviewer): readonly SessionTool[] {
  return [
    sessionTool({
      name: "next_question_candidates",
      description:
        "Returns Questions you may show next, from the current Section, as JSON, the most needed first: weak, long unasked and unstarted Topics come first. Questions already asked in this mock interview, recently answered with Grade 3, rated down or hidden are left out. The level follows the brief's questionLevel unless you give another one. Pick one and show it with present_question.",
      input: z.strictObject({
        limit: z.number().int().min(1).max(20).default(10),
        level: z
          .enum(["junior", "middle", "senior"])
          .optional()
          .describe(
            "Another level than questionLevel of the brief, when you adjust the difficulty.",
          ),
        topicId: z
          .uuid()
          .optional()
          .describe("Only this Topic of the current Section, such as for a Deeper question."),
      }),
      run: async (input, session) => interviewer.candidates(session.sessionId, input),
    }),
    sessionTool({
      name: "present_question",
      description:
        "Shows a Question to the Candidate as a card: a candidate by questionId, or, when no candidate fits, a new open question by text and topicId, which the app saves as unconfirmed. For a Deeper question, give parentAttemptId: the Attempt it goes deeper from, in the same Topic. Only one question is shown at a time: the next one needs the Attempt of the current one. After this call, end your turn and wait for the Candidate's answer.",
      input: z.strictObject({
        questionId: z.uuid().optional().describe("A candidate from next_question_candidates."),
        text: z
          .string()
          .min(1)
          .optional()
          .describe("A new question in the Target's language, only when no candidate fits."),
        topicId: z.uuid().optional().describe("The Topic of the new question."),
        parentAttemptId: z
          .uuid()
          .optional()
          .describe("For a Deeper question: the Attempt id that record_attempt returned."),
      }),
      run: async (input, session) => interviewer.present(session.sessionId, input),
    }),
    sessionTool({
      name: "set_current_section",
      description:
        "Moves the mock interview to another of its selected Sections; the Candidate sees it in the Section strip. next_question_candidates picks from the current Section.",
      input: z.strictObject({ sectionId: z.uuid().describe("A Section id from the brief.") }),
      run: async (input, session) => interviewer.setSection(session.sessionId, input),
    }),
  ];
}
