// `interview-sensei login opencode` as a process (#69). A stub `opencode` in PATH stands for
// OpenCode: it answers `--version` and records the login it was asked to run; no agent starts.
import { chmod, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it, onTestFinished } from "vitest";

import { startProcess } from "./process-under-test.ts";

const launchScript = path.join(import.meta.dirname, "launch.ts");

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), "interview-sensei-login-"));
  onTestFinished(async () => {
    await rm(directory, { recursive: true, force: true });
  });
  return directory;
}

/**
 * A home with a stub `opencode` that prints `version` for `--version`. For anything else it
 * writes its arguments, `XDG_DATA_HOME` and working directory to `record` and exits with code 3.
 */
async function candidateWithOpencode(version: string) {
  const home = await temporaryDirectory();
  const bin = path.join(home, "bin");
  const record = path.join(home, "login-record");
  await mkdir(bin);
  const script = path.join(bin, "opencode");
  await writeFile(
    script,
    [
      "#!/bin/sh",
      `if [ "$1" = "--version" ]; then echo '${version}'; exit 0; fi`,
      `echo "args=$*" > '${record}'`,
      `echo "data=$XDG_DATA_HOME" >> '${record}'`,
      `echo "cwd=$(pwd)" >> '${record}'`,
      "exit 3",
      "",
    ].join("\n"),
  );
  await chmod(script, 0o700);
  return { home, bin, record };
}

async function login(candidate: { home: string; bin: string }, dataDirectory: string) {
  return startProcess(launchScript, {
    args: ["login", "opencode"],
    env: { HOME: candidate.home, PATH: candidate.bin, INTERVIEW_SENSEI_DATA_DIR: dataDirectory },
  }).exit();
}

describe("interview-sensei login opencode", () => {
  it("runs OpenCode 2.x's login in the application's OpenCode homes and exits with its code", async () => {
    const candidate = await candidateWithOpencode("opencode v2.2.6");
    const dataDirectory = await temporaryDirectory();
    // The stub prints its physical working directory; the temporary directory may be a link.
    const own = path.join(await realpath(dataDirectory), "agents", "opencode");

    const { code } = await login(candidate, dataDirectory);

    expect(code).toBe(3);
    const record = await readFile(candidate.record, "utf8");
    expect(record).toContain("args=auth login --standalone");
    expect(record).toContain(`data=${path.join(dataDirectory, "agents", "opencode", "data-2")}\n`);
    expect(record).toContain(`cwd=${own}`);
  });

  it("refuses OpenCode 1.x with code 1 and runs no login", async () => {
    const candidate = await candidateWithOpencode("1.18.30");

    const { code, stderr } = await login(candidate, await temporaryDirectory());

    expect(code).toBe(1);
    expect(stderr).toContain("Отдельный вход нужен только OpenCode 2.x.");
    await expect(readFile(candidate.record, "utf8")).rejects.toThrow(/ENOENT/u);
  });
});
