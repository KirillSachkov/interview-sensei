// Seam 2 of spec #70: which reference answers answer search may write over.
import { describe, expect, it } from "vitest";

import { overwriteRefusal } from "./domain/answer-search.ts";

describe(overwriteRefusal, () => {
  it("writes an answer to a Question without one, with either origin", () => {
    expect(overwriteRefusal(null, "internet")).toBeNull();
    expect(overwriteRefusal(null, "agent")).toBeNull();
  });

  it("never overwrites an answer «из материала» or «проверен кандидатом»", () => {
    for (const origin of ["material", "candidate"] as const) {
      expect(overwriteRefusal({ origin }, "internet")).toMatch(/stays/u);
      expect(overwriteRefusal({ origin }, "agent")).toMatch(/stays/u);
    }
  });

  it("replaces an answer «из знаний агента» with one from the internet, but not the other way round", () => {
    expect(overwriteRefusal({ origin: "agent" }, "internet")).toBeNull();
    expect(overwriteRefusal({ origin: "agent" }, "agent")).toBeNull();
    expect(overwriteRefusal({ origin: "internet" }, "internet")).toBeNull();
    expect(overwriteRefusal({ origin: "internet" }, "agent")).toMatch(/never replaces/u);
  });
});
