// Runs the application's own OpenCode 2.x login (#69) in the Candidate's terminal: OpenCode asks
// the Candidate for the provider and opens the browser itself.
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdir } from "node:fs/promises";
import { constants } from "node:os";

import type { Timer } from "../../../shared/time/index.ts";
import { opencodeLoginCommand } from "../domain/opencode-login.ts";
import type { OpencodeLoginCommand } from "../domain/opencode-login.ts";
import { inspectAgentHost } from "./installation.ts";
import type { UserEnvironment } from "./installation.ts";

/** How the login ended: OpenCode's exit code, or why the application refused to start it. */
export type OpencodeLoginResult =
  | { readonly type: "exited"; readonly code: number }
  | { readonly type: "refused"; readonly reason: string };

/**
 * Runs `opencode auth login --standalone` in the application's OpenCode homes with the terminal's
 * input and output. OpenCode writes the login only into its database there, in the data
 * directory; the Candidate's OpenCode directories stay as they are.
 */
export async function loginToOpencode({
  dataDirectory,
  userEnvironment,
  timer,
}: {
  dataDirectory: string;
  userEnvironment: UserEnvironment;
  timer: Timer;
}): Promise<OpencodeLoginResult> {
  const host = await inspectAgentHost(userEnvironment, timer)();
  const login = opencodeLoginCommand(host, { dataDirectory, env: userEnvironment.env });
  if (login.type === "refused") {
    return login;
  }
  return run(login);
}

/** Runs the login with the terminal's input and output and waits for its end. */
async function run(
  login: Extract<OpencodeLoginCommand, { type: "run" }>,
): Promise<OpencodeLoginResult> {
  await mkdir(login.cwd, { recursive: true });
  const child = spawn(login.command, [...login.args], {
    cwd: login.cwd,
    env: login.env,
    stdio: "inherit",
  });
  try {
    await once(child, "exit");
  } catch (error) {
    // `once` rejects on the `error` event: OpenCode did not start.
    const reason = error instanceof Error ? error.message : "unknown error";
    return { type: "refused", reason: `Не удалось запустить OpenCode: ${reason}.` };
  }
  return { type: "exited", code: exitCode(child.exitCode, child.signalCode) };
}

/** The shell's exit code: OpenCode's own, or 128 plus the signal that stopped it, such as Ctrl+C. */
function exitCode(code: number | null, signal: NodeJS.Signals | null): number {
  if (code !== null) {
    return code;
  }
  return signal === null ? 1 : 128 + constants.signals[signal];
}
