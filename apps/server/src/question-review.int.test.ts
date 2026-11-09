// Seam 1 of spec #47: the Candidate's bulk review of Questions through the server's HTTP API. The
// fake interviewer records an Attempt, so deleting its Question hides it instead.
import { describe, expect, it } from "vitest";

import { cardAt, interviewApi, isGraded } from "./interview-test-support.ts";
import { first } from "./model-test-support.ts";
import type { Questions } from "./model-test-support.ts";

type Api = Awaited<ReturnType<typeof interviewApi>>;

async function review(api: Api, payload: object) {
  return api.server.inject({
    method: "POST",
    url: `/api/targets/${api.target.id}/questions/review`,
    headers: api.headers,
    payload,
  });
}

/** Every Question of the Target, visible and hidden. */
async function everyQuestion(api: Api): Promise<Questions> {
  const [visible, hidden] = await Promise.all([api.questions(), api.questions("?hidden=true")]);
  return [...visible, ...hidden];
}

/** The Question by id among the Target's Questions; undefined once it is deleted. */
async function questionOf(api: Api, id: string) {
  const questions = await everyQuestion(api);
  return questions.find((question) => question.id === id);
}

/** The ids of the first visible Questions of the demo Target. */
async function firstIds(api: Api, count: number): Promise<string[]> {
  const questions = await api.questions();
  return questions.slice(0, count).map((question) => question.id);
}

/** A Question answered in a Mock interview, so it has an Attempt, and another one without. */
async function answeredAndUntouched(api: Api) {
  const run = await api.answered(["Опыт и резюме"], "Ответ [grade:2]");
  const answered = cardAt(await run.events.waitFor(isGraded(0)), 0).questionId;
  const questions = await api.questions();
  const untouched = first(questions.filter((question) => question.id !== answered)).id;
  return { answered, untouched };
}

describe("the bulk review of Questions", () => {
  it("deletes Questions without Attempts and hides a Question with Attempts instead", async () => {
    const api = await interviewApi();
    const { answered, untouched } = await answeredAndUntouched(api);

    const response = await review(api, { action: "delete", questionIds: [answered, untouched] });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toStrictEqual({ deleted: [untouched], changed: [answered] });
    await expect(questionOf(api, answered)).resolves.toMatchObject({ hidden: true });
    await expect(questionOf(api, untouched)).resolves.toBeUndefined();
  });

  it("hides the chosen Questions, rates them «ошибка» with the comment, or useful by 👍", async () => {
    const api = await interviewApi();
    const [hidden = "", warned = "", confirmed = ""] = await firstIds(api, 3);

    await review(api, { action: "hide", questionIds: [hidden] });
    await review(api, { action: "warn", questionIds: [warned], comment: "Вопрос устарел" });
    await review(api, { action: "confirm", questionIds: [confirmed] });

    await expect(questionOf(api, hidden)).resolves.toMatchObject({ hidden: true });
    await expect(questionOf(api, warned)).resolves.toMatchObject({
      hidden: false,
      rating: "wrong",
      ratingComment: "Вопрос устарел",
    });
    await expect(questionOf(api, confirmed)).resolves.toMatchObject({
      rating: "useful",
      unconfirmed: false,
    });
  });

  it("refuses a Question of another Target and changes nothing", async () => {
    const api = await interviewApi();
    const [own = ""] = await firstIds(api, 1);

    const response = await review(api, {
      action: "hide",
      questionIds: [own, crypto.randomUUID()],
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: "unknown_questions" });
    await expect(questionOf(api, own)).resolves.toMatchObject({ hidden: false });
  });
});
