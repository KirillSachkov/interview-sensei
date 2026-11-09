// Runs the application's own OpenCode 2.x login (#69) in the Candidate's terminal: OpenCode asks
// the Candidate for the provider and opens the browser itself.
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdir } from "node:fs/promises";

import type { Timer } from "../../../shared/time/index.ts";
import { opencodeLoginCommand } from "../domain/opencode-login.ts";
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
  await mkdir(login.cwd, { recursive: true });
  const child = spawn(login.command, [...login.args], {
    cwd: login.cwd,
    env: login.env,
    stdio: "inherit",
  });
  await once(child, "exit");
  // A login stopped by a signal, such as Ctrl+C, has no exit code.
  return { type: "exited", code: child.exitCode ?? 1 };
}
