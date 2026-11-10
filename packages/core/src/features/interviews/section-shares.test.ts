// Unit tests of the Section shares of a Mock interview (#64): by the number and importance of the
// Topics, and the move to the next Section that the server suggests by them.
import { describe, expect, it } from "vitest";

import { sectionShares, suggestedSection } from "./domain/section-shares.ts";
import type { TopicImportance } from "./domain/ports.ts";

function section(id: string, importances: readonly TopicImportance[]) {
  return {
    id,
    topics: importances.map((importance, index) => ({
      id: `${id}-${index}`,
      name: `Тема ${index}`,
      importance,
    })),
  };
}

const go = section("go", ["normal", "normal", "normal"]);
const sql = section("sql", ["normal"]);

/** The suggested Section of a 40-minute Mock interview in «go» after the running minutes. */
const at = (runningMinutes: number) =>
  suggestedSection([go, sql], {
    currentSectionId: "go",
    pace: { limitMinutes: 40, runningMinutes },
  });

/** The suggested Section of a Mock interview without a limit after the asked questions. */
const afterQuestions = (currentSectionId: string, askedCount: number) =>
  suggestedSection([go, sql], { currentSectionId, pace: { limitMinutes: null, askedCount } });

describe("section shares", () => {
  it("grow with the number of Topics", () => {
    expect(sectionShares([go, sql])).toStrictEqual([
      { id: "go", share: 0.75 },
      { id: "sql", share: 0.25 },
    ]);
  });

  it("grow with the importance of the Topics", () => {
    const shares = sectionShares([section("high", ["high"]), section("low", ["low", "low"])]);

    expect(shares).toStrictEqual([
      { id: "high", share: 2 / 3 },
      { id: "low", share: 1 / 3 },
    ]);
  });

  it("count a Section without Topics as one normal Topic", () => {
    expect(sectionShares([section("talk", []), sql])).toStrictEqual([
      { id: "talk", share: 0.5 },
      { id: "sql", share: 0.5 },
    ]);
  });
});

describe("the suggested Section", () => {
  it("is the next one once the current one used its minutes", () => {
    expect(at(29)).toBeUndefined();
    expect(at(30)).toBe("sql");
  });

  it("never goes back with a time limit, past the limit included", () => {
    expect(
      suggestedSection([go, sql], {
        currentSectionId: "sql",
        pace: { limitMinutes: 40, runningMinutes: 5 },
      }),
    ).toBeUndefined();
    expect(
      suggestedSection([go, sql], {
        currentSectionId: "sql",
        pace: { limitMinutes: 40, runningMinutes: 55 },
      }),
    ).toBeUndefined();
  });

  it("follows each round of ten questions without a time limit", () => {
    expect(afterQuestions("go", 7)).toBeUndefined();
    expect(afterQuestions("go", 8)).toBe("sql");
    expect(afterQuestions("sql", 10)).toBe("go");
  });
});
