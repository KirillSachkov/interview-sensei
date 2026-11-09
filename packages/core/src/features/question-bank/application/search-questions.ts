import { z } from "zod";

import { sessionTool } from "../../../shared/mcp/index.ts";
import type { SectionTopics } from "../domain/ports.ts";
import type { QuestionBank } from "./question-bank.ts";

export function searchQuestions(questionBank: QuestionBank, sections: SectionTopics) {
  return sessionTool({
    name: "search_questions",
    description:
      "Searches Questions of this session's Target. Every query word must occur in the Question text, ignoring case. Filter by Topic or Section. Hidden Questions are excluded. The default limit is 20, maximum 50.",
    input: z.strictObject({
      text: z.string().optional(),
      topicId: z.uuid().optional(),
      sectionId: z.uuid().optional(),
      limit: z.number().int().min(1).max(50).default(20),
    }),
    run: async ({ text, topicId, sectionId, limit }, session) => {
      if (session.targetId === undefined || session.targetId === null) {
        return "This session has no Target";
      }
      const topicIds =
        sectionId === undefined
          ? undefined
          : ((await sections.topicIds(session.targetId, sectionId)) ?? []);
      return JSON.stringify(
        await questionBank.search(session.targetId, {
          ...(text === undefined ? {} : { text }),
          ...(topicId === undefined ? {} : { topicId }),
          ...(topicIds === undefined ? {} : { topicIds }),
          limit,
        }),
      );
    },
  });
}
