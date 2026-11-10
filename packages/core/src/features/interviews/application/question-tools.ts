// The interviewer's MCP tools that choose and show the questions (#10), with the current Section.
import { z } from "zod";

import { sessionTool } from "../../../shared/mcp/index.ts";
import type { SessionTool } from "../../../shared/mcp/index.ts";
import { levels } from "../domain/interview.ts";
import type { Interviewer } from "./interviewer.ts";

/** What `present_question` takes: a candidate, or a new question with the reason. */
const presentInput = z.strictObject({
  questionId: z.uuid().optional().describe("A candidate from next_question_candidates."),
  text: z
    .string()
    .min(1)
    .optional()
    .describe("A new question in the Target's language, only when no candidate fits."),
  topicId: z.uuid().optional().describe("The Topic of the new question."),
  reason: z
    .string()
    .min(1)
    .optional()
    .describe("For a new question: why none of the candidates fits."),
  parentAttemptId: z
    .uuid()
    .optional()
    .describe("For a Deeper question: the Attempt id that record_attempt returned."),
});

export function questionTools(interviewer: Interviewer): readonly SessionTool[] {
  return [
    sessionTool({
      name: "next_question_candidates",
      description:
        "Returns the 5 Questions you may show next, from the current Section, as JSON, the most needed first, each with its reasons: a retry after a mistake, a weak, not started, important, long unasked Topic, or one not covered in this interview yet. Questions already asked in this mock interview, resting after a recent Grade 3 or 2, rated down or hidden are left out, and so is a Topic that just had its limit of questions in a row. sectionHint, when set, suggests the move to another Section by the Section shares. The level follows the brief's questionLevel unless you give another one. Pick one and show it with present_question.",
      input: z.strictObject({
        level: z
          .enum(levels)
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
        "Shows a Question to the Candidate as a card: a candidate by questionId, or, only when no candidate fits, a new open question by text, topicId and reason, which the app saves as unconfirmed. For a Deeper question, give parentAttemptId: the Attempt it goes deeper from, in the same Topic. A Topic gets at most 3 questions in a row, Deeper questions included, 4 when it is shaky. Only one question is shown at a time: the next one needs the Attempt of the current one. Returns the question's reference answer for your judgment. After this call, end your turn and wait for the Candidate's answer.",
      input: presentInput,
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
