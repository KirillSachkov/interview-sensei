// Spec #70 with #65: an answer search replaces an answer «из знаний агента» of a Question asked in a
// Mock interview, and the Question stays on the list «проверить опорный ответ»: only the Candidate
// takes it off, by «Проверен» or a correction.
import { describe, expect, it } from "vitest";

import { latestAnswerReport, startSearch } from "./answer-test-support.ts";
import { startServer, temporaryDirectory } from "./chat-test-support.ts";
import { cardAt, interviewApi, isGraded } from "./interview-test-support.ts";
import { seed } from "./model-test-support.ts";
import { questionsOf } from "./setup-test-support.ts";

const agentAnswer = {
  points: ["Пункт из знаний агента", "Второй пункт", "Третий пункт"],
  sample: "Образец из знаний агента.",
  origin: "agent" as const,
  sourceId: null,
  part: null,
};

describe("an answer search and the list «проверить опорный ответ»", () => {
  it("keeps the disputed Question on the list when it replaces its answer «из знаний агента»", async () => {
    const dataDirectory = await temporaryDirectory();
    const mock = await interviewApi({ dataDirectory });
    const run = await mock.answered(["Опыт и резюме"], "Ответ [grade:1] [last]");
    const { questionId } = cardAt(await run.events.waitFor(isGraded(0)), 0);
    await mock.stop();
    await seed(dataDirectory, async ({ questionBank, storage }) => {
      await questionBank.editQuestions(mock.target.id, [
        { id: questionId, referenceAnswer: agentAnswer },
      ]);
      await storage.transaction(async (transaction) =>
        questionBank.requestReferenceCheck(
          { questionId, comment: "Пункты неполные.", requestedAt: "2026-11-10T00:00:00.000Z" },
          transaction,
        ),
      );
    });
    const { server } = await startServer(dataDirectory);

    expect((await startSearch(server, mock.target.id, 1)).statusCode).toBe(202);
    const report = await latestAnswerReport(server, mock.target.id);

    expect(report).toMatchObject({ filled: 1, questions: [{ questionId, origin: "internet" }] });
    await expect(
      questionsOf(server, mock.target.id, "?referenceCheck=true"),
    ).resolves.toMatchObject([
      {
        id: questionId,
        referenceAnswer: { origin: "internet" },
        referenceCheck: { reason: "dispute", comment: "Пункты неполные." },
      },
    ]);
  });
});
