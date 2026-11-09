import { describe, expect, it } from "vitest";

import { browserCommand } from "./browser.ts";

const url = "http://127.0.0.1:4310/";

describe("browser command", () => {
  it("opens the URL with open on macOS", () => {
    expect(browserCommand("darwin", url)).toStrictEqual({ command: "open", args: [url] });
  });

  it("opens the URL with xdg-open on Linux", () => {
    expect(browserCommand("linux", url)).toStrictEqual({ command: "xdg-open", args: [url] });
  });

  it("passes the URL on Windows as one argument that cmd does not parse", () => {
    const urlWithQuery = "http://127.0.0.1:4310/?a=1&b=2";

    expect(browserCommand("win32", urlWithQuery)).toStrictEqual({
      command: "rundll32",
      args: ["url.dll,FileProtocolHandler", urlWithQuery],
    });
  });
});
