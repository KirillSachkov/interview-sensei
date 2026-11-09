// Test helper for integration tests that run a server entry point as a process.
import { spawn } from "node:child_process";
import { once } from "node:events";

import { onTestFinished } from "vitest";

/**
 * Runs `node <script> <args>` with the extra environment variables and collects its output. The
 * process is killed when the test finishes, unless it has exited.
 */
export function startProcess(
  script: string,
  { args = [], env }: { args?: readonly string[]; env: NodeJS.ProcessEnv },
) {
  const child = spawn(process.execPath, [script, ...args], {
    env: { ...process.env, ...env },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const exited = once(child, "exit");
  onTestFinished(async () => {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill("SIGKILL");
      await exited;
    }
  });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk: Buffer) => {
    stdout += chunk.toString();
  });
  child.stderr.on("data", (chunk: Buffer) => {
    stderr += chunk.toString();
  });
  return {
    pid: child.pid,
    /** Waits until the standard output matches the pattern and returns the match. */
    output: async (pattern: RegExp): Promise<RegExpMatchArray> => {
      for (;;) {
        const match = pattern.exec(stdout);
        if (match !== null) {
          return match;
        }
        if (child.exitCode !== null) {
          throw new Error(`The process exited with code ${child.exitCode}: ${stderr}`);
        }
        // oxlint-disable-next-line eslint/no-await-in-loop -- waits for the next output chunk
        await Promise.race([once(child.stdout, "data"), exited]);
      }
    },
    stop: async () => {
      child.kill("SIGTERM");
      await exited;
      return { code: child.exitCode, stdout };
    },
    exit: async () => {
      await exited;
      return { code: child.exitCode, stdout, stderr };
    },
  };
}
