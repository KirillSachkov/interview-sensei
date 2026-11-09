import { describe, expect, it } from "vitest";

import { resolveDataDirectory } from "./data-directory.ts";

const home = "/home/candidate";
const workingDirectory = "/work";

describe(resolveDataDirectory, () => {
  it("uses ~/.interview-sensei when the variable is not set", () => {
    expect(resolveDataDirectory({ env: {}, home, workingDirectory })).toBe(
      "/home/candidate/.interview-sensei",
    );
  });

  it("uses ~/.interview-sensei when the variable is empty", () => {
    const env = { INTERVIEW_SENSEI_DATA_DIR: "" };

    expect(resolveDataDirectory({ env, home, workingDirectory })).toBe(
      "/home/candidate/.interview-sensei",
    );
  });

  it("uses the absolute directory from the variable", () => {
    const env = { INTERVIEW_SENSEI_DATA_DIR: "/data/sensei" };

    expect(resolveDataDirectory({ env, home, workingDirectory })).toBe("/data/sensei");
  });

  it("resolves a relative directory from the variable against the working directory", () => {
    const env = { INTERVIEW_SENSEI_DATA_DIR: "data/sensei" };

    expect(resolveDataDirectory({ env, home, workingDirectory })).toBe("/work/data/sensei");
  });
});
