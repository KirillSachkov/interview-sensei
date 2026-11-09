import { describe, expect, it } from "vitest";

import { appUrl } from "./app-url.ts";

describe("app URL", () => {
  it("uses the IPv4 address the server listens on", () => {
    expect(appUrl({ address: "127.0.0.1", port: 4310 })).toBe("http://127.0.0.1:4310/");
  });

  it("puts an IPv6 address in brackets", () => {
    expect(appUrl({ address: "::1", port: 4310 })).toBe("http://[::1]:4310/");
  });
});
