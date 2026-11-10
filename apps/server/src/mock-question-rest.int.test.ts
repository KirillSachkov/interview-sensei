// Issue #103: the server enforces rest even when the interviewer obtains a bank id through
// search_questions instead of next_question_candidates. Real MCP, storage and the fake ACP agent.
import { describe, expect, it } from "vitest";

import {
  cardAt,
  hasQuestions,
  interviewApi,
  isGraded,
  saysWhenIdle,
} from "./interview-test-support.ts";
import { callTextTool } from "./progress-test-support.ts";

describe("rest between mock interviews on the MCP path", () => {
  it.each([0, 1, 2, 3])(
    "enforces rest after Grade %i, then permits the question",
    async (grade) => {
      const api = await interviewApi();
      const first = await api.answered(["Опыт и резюме"], `Ответ [grade:${grade}] [last]`);
      await first.events.waitFor(isGraded(0));
      await first.chat.waitFor(saysWhenIdle("Ответ получен."));
      await api.finish(first.interview.id);
      await first.events.waitFor((view) => view.status === "finished");

      for (let round = 0; round < Math.max(1, grade); round += 1) {
        const run = await api.answered(
          ["TypeScript и Node.js", "Опыт и резюме"],
          "Ответ [grade:0] [last]",
        );
        await run.events.waitFor(isGraded(0));
        await run.chat.waitFor(saysWhenIdle("Ответ получен."));
        await callTextTool(run.chat, "set_current_section", {
          sectionId: api.sectionId("Опыт и резюме"),
        });
        const questionId = first.card.questionId;
        const searched = await callTextTool(run.chat, "search_questions", {});
        expect(searched).toContain(questionId);
        const result = await callTextTool(run.chat, "present_question", { questionId });
        if (round < grade - 1) {
          expect(result).toContain("This question is still resting");
          const view = await api.get(`/api/interviews/${run.interview.id}`);
          expect(view.json<{ questions: unknown[] }>().questions).toHaveLength(1);
        } else {
          expect(result).toContain("The question is shown");
          const shown = cardAt(await run.events.waitFor(hasQuestions(2)), 1);
          expect(shown.questionId).toBe(questionId);
        }
        await api.finish(run.interview.id);
        await run.events.waitFor((view) => view.status === "finished");
      }
    },
  );
});
