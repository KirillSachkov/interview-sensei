import { describe, expect, it } from "vitest";

import { launchOptions } from "./launch-options.ts";

describe("browser opening", () => {
  it("opens the browser by default", () => {
    expect(launchOptions({ args: [], env: {} }).openBrowser).toBe(true);
  });

  it("does not open the browser with the --no-browser flag", () => {
    expect(launchOptions({ args: ["--no-browser"], env: {} }).openBrowser).toBe(false);
  });

  it("does not open the browser when INTERVIEW_SENSEI_NO_BROWSER is 1", () => {
    const env = { INTERVIEW_SENSEI_NO_BROWSER: "1" };

    expect(launchOptions({ args: [], env }).openBrowser).toBe(false);
  });
});

describe("port choice", () => {
  it("tries 4310 and the nine ports after it without a flag or SERVER_PORT", () => {
    expect(launchOptions({ args: [], env: {} }).port.ports).toStrictEqual([
      4310, 4311, 4312, 4313, 4314, 4315, 4316, 4317, 4318, 4319,
    ]);
  });

  it("tries only the port of the --port flag, also over SERVER_PORT", () => {
    const options = launchOptions({ args: ["--port", "5000"], env: { SERVER_PORT: "6000" } });

    expect(options.port.ports).toStrictEqual([5000]);
  });

  it("tries only the port of SERVER_PORT without the flag", () => {
    expect(launchOptions({ args: [], env: { SERVER_PORT: "6000" } }).port.ports).toStrictEqual([
      6000,
    ]);
  });

  it.each(["abc", "-1", "65536", "4310.5", ""])("refuses the port «%s» of the flag", (port) => {
    expect(() => launchOptions({ args: [`--port=${port}`], env: {} })).toThrow(
      `Порт «${port}» в --port не подходит`,
    );
  });

  it("refuses a SERVER_PORT that is not a port number", () => {
    expect(() => launchOptions({ args: [], env: { SERVER_PORT: "http" } })).toThrow(
      "Порт «http» в SERVER_PORT не подходит",
    );
  });
});

describe("command line", () => {
  it("passes the --data-dir flag as written", () => {
    expect(launchOptions({ args: ["--data-dir", "data"], env: {} }).dataDirectory).toBe("data");
  });

  it("asks for help with --help and -h", () => {
    expect(launchOptions({ args: ["--help"], env: {} }).help).toBe(true);
    expect(launchOptions({ args: ["-h"], env: {} }).help).toBe(true);
  });

  it("refuses an unknown flag by its name", () => {
    expect(() => launchOptions({ args: ["--prot", "4400"], env: {} })).toThrow(
      "Неизвестный флаг --prot.",
    );
  });

  it("refuses a flag without its value", () => {
    expect(() => launchOptions({ args: ["--port"], env: {} })).toThrow(
      "Флагу --port нужно значение.",
    );
  });

  it("refuses an argument that is not a flag", () => {
    expect(() => launchOptions({ args: ["start"], env: {} })).toThrow("Лишний аргумент «start».");
  });
});
