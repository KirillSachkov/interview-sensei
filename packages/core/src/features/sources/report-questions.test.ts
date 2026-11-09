import { describe, expect, it } from "vitest";

import { reportQuestions } from "./domain/report-questions.ts";

const question = (id: string, unseen: boolean) => ({ id, unseen });
const bank = [question("seen", false), question("second", true), question("first", true)];

describe("the Questions of an Inbox report", () => {
  it("lists the report's Questions in the order the agent added them, without deleted ones", () => {
    expect(
      reportQuestions(["first", "deleted", "seen", "second"], bank, { onlyNew: false }).map(
        ({ id }) => id,
      ),
    ).toStrictEqual(["first", "seen", "second"]);
  });

  it("the filter «новые с последнего просмотра» keeps only the Questions the Candidate has not seen", () => {
    expect(
      reportQuestions(["first", "seen", "second"], bank, { onlyNew: true }).map(({ id }) => id),
    ).toStrictEqual(["first", "second"]);
  });

  it("leaves out the Questions of the bank that the report did not add", () => {
    expect(reportQuestions(["seen"], bank, { onlyNew: true })).toStrictEqual([]);
  });
});
