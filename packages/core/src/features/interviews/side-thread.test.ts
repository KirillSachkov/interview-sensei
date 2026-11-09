// Unit tests of the question that an interviewer message opens a Side thread on (#80). They sit at
// the slice root: domain-is-pure keeps even test imports such as vitest out of domain/.
import { describe, expect, it } from "vitest";

import { questionAtMessage } from "./domain/side-thread.ts";

describe("question at an interviewer message", () => {
  it("gives the question that was shown when the message came", () => {
    const asked = [
      { id: "first", chatPosition: 2 },
      { id: "second", chatPosition: 6 },
    ];

    expect(questionAtMessage(asked, 4)).toMatchObject({ id: "first" });
    expect(questionAtMessage(asked, 6)).toMatchObject({ id: "second" });
  });

  it("gives no question for a message from before the first question", () => {
    expect(questionAtMessage([{ id: "first", chatPosition: 2 }], 1)).toBeUndefined();
  });

  it("counts a question from before Side threads, without a chat position, as shown at the chat's start", () => {
    const asked = [
      { id: "old", chatPosition: null },
      { id: "new", chatPosition: 5 },
    ];

    expect(questionAtMessage(asked, 0)).toMatchObject({ id: "old" });
    expect(questionAtMessage(asked, 4)).toMatchObject({ id: "old" });
    expect(questionAtMessage(asked, 5)).toMatchObject({ id: "new" });
  });
});
