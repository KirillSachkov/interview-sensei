// Seam 1 of spec #47: the Candidate's bulk review of Questions through the server's HTTP API. The
// fake interviewer records an Attempt, so deleting its Question hides it instead.
import { describe, expect, it } from "vitest";

import { cardAt, interviewApi, isGraded } from "./interview-test-support.ts";
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
  return [...(await api.questions()), ...(await api.questions("?hidden=true"))];
}

const byId = (questions: Questions, id: string) => questions.find((question) => question.id === id);

describe("the bulk review of Questions", () => {
  it("deletes Questions without Attempts and hides a Question with Attempts instead", async () => {
    const api = await interviewApi();
    const run = await api.answered(["Опыт и резюме"], "Ответ [grade:2]");
    const answered = cardAt(await run.events.waitFor(isGraded(0)), 0).questionId;
    const untouched = (await api.questions()).find((question) => question.id !== answered);

    const response = await review(api, {
      action: "delete",
      questionIds: [answered, untouched?.id],
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toStrictEqual({ deleted: [untouched?.id], changed: [answered] });
    const after = await everyQuestion(api);
    expect(byId(after, answered)).toMatchObject({ hidden: true });
    expect(byId(after, untouched?.id ?? "")).toBeUndefined();
  });

  it("hides the chosen Questions, rates them «ошибка» with the comment, or useful by 👍", async () => {
    const api = await interviewApi();
    const [first, second, third] = await api.questions();
    const ids = [first?.id, second?.id, third?.id];

    await review(api, { action: "hide", questionIds: [ids[0]] });
    await review(api, { action: "warn", questionIds: [ids[1]], comment: "Вопрос устарел" });
    await review(api, { action: "confirm", questionIds: [ids[2]] });

    const after = await everyQuestion(api);
    expect(byId(after, ids[0] ?? "")).toMatchObject({ hidden: true });
    expect(byId(after, ids[1] ?? "")).toMatchObject({
      hidden: false,
      rating: "wrong",
      ratingComment: "Вопрос устарел",
    });
    expect(byId(after, ids[2] ?? "")).toMatchObject({ rating: "useful", unconfirmed: false });
  });

  it("refuses a Question of another Target and changes nothing", async () => {
    const api = await interviewApi();
    const [own] = await api.questions();

    const response = await review(api, {
      action: "hide",
      questionIds: [own?.id, crypto.randomUUID()],
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: "unknown_questions" });
    expect(byId(await api.questions(), own?.id ?? "")).toMatchObject({ hidden: false });
  });
});
