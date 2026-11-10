// Issue #103: rest is enforced even when the interviewer gets an id from search_questions.
// The fake ACP agent calls the real MCP tools after their permission request.
import { describe, expect, it } from "vitest";

import { ask, interviewApi, isGraded, saysWhenIdle } from "./interview-test-support.ts";
import { manualTime } from "./interview-flow-test-support.ts";
import { promptTool } from "./progress-test-support.ts";

type Api = Awaited<ReturnType<typeof restApi>>;

/** Distinct start times keep interview recency independent of randomly generated ids. */
async function restApi() {
  const time = manualTime();
  const api = await interviewApi(time);
  return { ...api, advance: () => time.pass(1000) };
}

/** Clears a question in another Section, leaving the searched bank question available to show. */
async function nextRound(api: Api) {
  api.advance();
  const run = await api.answered(
    ["TypeScript и Node.js", "Опыт и резюме"],
    "Ответ [grade:0] [last]",
  );
  await run.events.waitFor(isGraded(0));
  await run.chat.waitFor(saysWhenIdle("Ответ получен."));
  await promptTool(run.chat, "set_current_section", {
    sectionId: api.sectionId("TypeScript и Node.js"),
  });
  return run;
}

/** A finished Mock interview with one known Grade. */
async function gradedQuestion(api: Api) {
  const run = await api.answered(["TypeScript и Node.js"], "Ответ [grade:2] [last]");
  await run.events.waitFor(isGraded(0));
  await run.chat.waitFor(saysWhenIdle("Ответ получен."));
  await finish(api, run);
  return run.card;
}

async function finish(api: Api, run: Awaited<ReturnType<Api["started"]>>) {
  await api.finish(run.interview.id);
  await run.events.waitFor((view) => view.status === "finished");
}

// Grade 0–3 and the end of rest are covered by core candidates.test.ts. This regression
// needs only two interviews: a Grade 2, then an attempted bypass through search_questions.
describe("rest between mock interviews on the MCP path", () => {
  it("refuses a resting question found through search without adding a card", async () => {
    const api = await restApi();
    const { questionId } = await gradedQuestion(api);
    const run = await nextRound(api);

    await expect(promptTool(run.chat, "search_questions")).resolves.toContain(questionId);
    const reply = await ask(
      run.chat,
      `/tool present_question ${JSON.stringify({ questionId })}`,
      "Ошибка present_question:",
    );

    expect(reply).toContain("This question is still resting");
    const view = await api.get(`/api/interviews/${run.interview.id}`);
    expect(view.json<{ questions: unknown[] }>().questions).toHaveLength(1);
  });
});
