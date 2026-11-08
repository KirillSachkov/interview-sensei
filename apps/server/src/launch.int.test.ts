import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it, onTestFinished } from "vitest";

import { startProcess } from "./process-under-test.ts";

const launchScript = path.join(import.meta.dirname, "launch.ts");
const indexHtml = "<!doctype html><title>Interview Sensei</title>";

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), "interview-sensei-launch-"));
  onTestFinished(async () => {
    await rm(directory, { recursive: true, force: true });
  });
  return directory;
}

/** Runs the `interview-sensei` command on a free port without the system browser. */
async function startLaunch(webDirectory: string) {
  return startProcess(launchScript, {
    args: ["--no-browser"],
    env: {
      INTERVIEW_SENSEI_DATA_DIR: await temporaryDirectory(),
      INTERVIEW_SENSEI_WEB_DIR: webDirectory,
      SERVER_PORT: "0",
    },
  });
}

describe("interview-sensei command", () => {
  it("exits with code 1 and asks for pnpm build when the web app is not built", async () => {
    const webDirectory = path.join(await temporaryDirectory(), "dist");
    const launch = await startLaunch(webDirectory);

    const { code, stderr } = await launch.exit();

    expect(code).toBe(1);
    expect(stderr).toContain(`Веб-приложение не собрано: нет ${webDirectory}`);
    expect(stderr).toContain("Выполните pnpm build");
  });

  it("prints only the URL of the served web app on stdout", async () => {
    const webDirectory = await temporaryDirectory();
    await writeFile(path.join(webDirectory, "index.html"), indexHtml);
    const launch = await startLaunch(webDirectory);

    const [line] = await launch.output(/Interview Sensei: http:\/\/127\.0\.0\.1:\d+\/\n/u);

    const response = await fetch(line.slice("Interview Sensei: ".length).trim());
    await expect(response.text()).resolves.toBe(indexHtml);
    const { code, stdout } = await launch.stop();
    expect(code).toBe(0);
    // Info-level JSON logs would bury the URL line.
    expect(stdout).toBe(line);
  });
});
