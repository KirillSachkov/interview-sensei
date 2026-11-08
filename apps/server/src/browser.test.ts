import { describe, expect, it } from "vitest";

import { browserCommand, opensBrowser } from "./browser.ts";

const url = "http://127.0.0.1:4310/";

describe("browser command", () => {
  it("opens the URL with open on macOS", () => {
    expect(browserCommand("darwin", url)).toStrictEqual({ command: "open", args: [url] });
  });

  it("opens the URL with xdg-open on Linux", () => {
    expect(browserCommand("linux", url)).toStrictEqual({ command: "xdg-open", args: [url] });
  });

  it("opens the URL with start through cmd on Windows", () => {
    expect(browserCommand("win32", url)).toStrictEqual({
      command: "cmd",
      args: ["/c", "start", '""', url],
    });
  });
});

describe("browser opening", () => {
  it("opens the browser by default", () => {
    expect(opensBrowser({ args: [], env: {} })).toBe(true);
  });

  it("does not open the browser with the --no-browser flag", () => {
    expect(opensBrowser({ args: ["--no-browser"], env: {} })).toBe(false);
  });

  it("does not open the browser when INTERVIEW_SENSEI_NO_BROWSER is 1", () => {
    expect(opensBrowser({ args: [], env: { INTERVIEW_SENSEI_NO_BROWSER: "1" } })).toBe(false);
  });
});
