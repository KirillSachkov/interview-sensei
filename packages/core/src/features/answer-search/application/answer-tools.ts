// The MCP tools of the `answer-search` session. Each acts only on the Target of its session.
import { z } from "zod";

import { sessionTool } from "../../../shared/mcp/index.ts";
import type { AnswerSearch } from "./answer-search.ts";

function nextQuestionsWithoutAnswer(search: AnswerSearch) {
  return sessionTool({
    name: "next_questions_without_answer",
    description:
      "Returns the next Questions of this answer search's queue, at most `count`: id, text, Topic, level, the Section kind and `currentOrigin`, which is `agent` when the Question already has an answer from an agent's own knowledge that a web source should replace. `left` says how many Questions the queue still holds. An empty list means the queue is done: write the report.",
    input: z.strictObject({ count: z.number().int().min(1).max(10).default(5) }),
    run: async ({ count }, session) => JSON.stringify(await search.nextQuestions(session, count)),
  });
}

function saveReferenceAnswer(search: AnswerSearch) {
  return sessionTool({
    name: "save_reference_answer",
    description:
      "Writes the reference answer of a Question from next_questions_without_answer: 3–5 key points, a short sample answer and its origin. Origin `internet` needs the URLs of the web pages that support it in `links`; origin `agent`, an answer from your own knowledge, takes no links. The server keeps an answer «из материала» and one the Candidate checked, and never replaces an answer from the internet with one from your knowledge; it refuses such a write.",
    input: z.strictObject({
      questionId: z.uuid(),
      points: z.array(z.string().trim().min(1)).min(3).max(5),
      sample: z.string().trim().min(1),
      origin: z.enum(["internet", "agent"]),
      links: z
        .array(z.url({ protocol: /^https?$/u }))
        .max(5)
        .default([]),
    }),
    run: async (input, session) => JSON.stringify(await search.saveAnswer(session, input)),
  });
}

function writeAnswerReport(search: AnswerSearch) {
  return sessionTool({
    name: "write_answer_report",
    description:
      "Writes the answer report and finishes the answer search; call it once, at the end. Give a short summary in the Target's language and each Question you could not fill, by id, with the reason. The server adds the counts of written answers by origin and the token usage.",
    input: z.strictObject({
      summary: z.string().trim().min(1),
      failed: z
        .array(z.strictObject({ questionId: z.uuid(), reason: z.string().trim().min(1) }))
        .default([]),
    }),
    run: async (input, session) => {
      const report = await search.writeReport(session, input);
      return JSON.stringify({ reportId: report.id });
    },
  });
}

/** The tools of the `answer-search` session. */
export function answerTools(search: AnswerSearch) {
  return [
    nextQuestionsWithoutAnswer(search),
    saveReferenceAnswer(search),
    writeAnswerReport(search),
  ];
}
