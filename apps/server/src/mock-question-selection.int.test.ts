// Issue #64: the question selection v2 through the interviewer's MCP tools on the demo Target, with
// the fake ACP agent in its interviewer mode. The ranking itself is unit-tested in core
// (candidates.test.ts, section-shares.test.ts); these tests check what the agent gets and what the
// server refuses.
import { describe, expect, it } from "vitest";

import {
  ask,
  cardAt,
  hasQuestions,
  interviewApi,
  isGraded,
  saysWhenIdle,
  sectionNamed,
} from "./interview-test-support.ts";
import { callTool, promptTool } from "./progress-test-support.ts";

type Api = Awaited<ReturnType<typeof interviewApi>>;

/** A field of a parsed JSON object; undefined for anything else. */
const fieldOf = (value: unknown, key: string): unknown =>
  typeof value === "object" && value !== null ? Reflect.get(value, key) : undefined;

/** The list in a field of a parsed JSON object; throws when it is not a list. */
function listIn(value: unknown, key: string): readonly unknown[] {
  const list = fieldOf(value, key);
  if (!Array.isArray(list)) {
    throw new TypeError(`No list ${key} in ${JSON.stringify(value)}`);
  }
  return list;
}

/** Starts on the Sections and answers the first question with `[last]`, so the chat answers. */
async function quietInterview(api: Api, names: readonly string[]) {
  const run = await api.answered(names, "Ответ [last]");
  await run.events.waitFor(isGraded(0));
  await run.chat.waitFor(saysWhenIdle("Ответ получен."));
  return run;
}

describe("the question selection v2", () => {
  it("gives at most five candidates, each with its reasons", async () => {
    const api = await interviewApi();
    const run = await quietInterview(api, ["Опыт и резюме"]);

    const found = await callTool(run.chat, "next_question_candidates");

    expect(found).toMatchObject({ sectionHint: null });
    const candidates = listIn(found, "candidates");
    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates.length).toBeLessThanOrEqual(5);
    for (const candidate of candidates) {
      expect(listIn(candidate, "reasons").length).toBeGreaterThan(0);
    }
  });

  it("permits the fifth candidate after the interviewer requests another level", async () => {
    const api = await interviewApi();
    const run = await quietInterview(api, ["TypeScript и Node.js"]);
    const found: unknown = JSON.parse(
      await promptTool(run.chat, "next_question_candidates", { level: "senior" }),
    );
    const candidates = listIn(found, "candidates");
    expect(candidates).toHaveLength(5);
    const questionId = fieldOf(candidates[4], "id");

    run.chat.send({
      type: "prompt",
      text: `/tool present_question ${JSON.stringify({ questionId })}`,
    });
    const shown = cardAt(await run.events.waitFor(hasQuestions(2)), 1);
    expect(shown.questionId).toBe(questionId);
  });

  it("gives the share of each Section and the importance of its Topics in the brief", async () => {
    const api = await interviewApi();
    const run = await quietInterview(api, ["Опыт и резюме", "TypeScript и Node.js"]);

    const sections = listIn(await callTool(run.chat, "get_brief"), "sections");

    const shares = sections.map((section) => Number(fieldOf(section, "sharePercent")));
    expect(shares.reduce((sum, share) => sum + share, 0)).toBeGreaterThanOrEqual(99);
    expect(sections.map((section) => fieldOf(section, "minutes"))).toStrictEqual([null, null]);
    expect(sections.flatMap((section) => listIn(section, "topics"))).toContainEqual(
      expect.objectContaining({ importance: "normal" }),
    );
  });

  it("refuses a fourth question in a row on one Topic, Deeper questions included", async () => {
    const api = await interviewApi();
    const run = await api.answered(["Опыт и резюме"], "Ответ [grade:3] [deeper]");
    await run.events.waitFor(hasQuestions(2));
    await api.answer(run.interview.id, "Ответ [grade:3] [deeper]");
    const third = cardAt(await run.events.waitFor(hasQuestions(3)), 2);

    await api.answer(run.interview.id, "Ответ [grade:3] [deeper]");

    await run.chat.waitFor(saysWhenIdle("already had 3 questions in a row"));
    const view = await run.events.waitFor(isGraded(2));
    expect(view.questions).toHaveLength(3);
    expect(new Set(view.questions.map((card) => card.topicId))).toStrictEqual(
      new Set([third.topicId]),
    );
  });

  it("refuses a made-up question without the reason why no candidate fits", async () => {
    const api = await interviewApi();
    const run = await quietInterview(api, ["Опыт и резюме"]);
    const [topicId] = sectionNamed(api.target, "Опыт и резюме").topicIds;
    const input = JSON.stringify({ text: "Свой вопрос", topicId });

    const reply = await ask(run.chat, `/tool present_question ${input}`, "Ошибка present_question");

    expect(reply).toContain("A new question needs reason");
  });
});
