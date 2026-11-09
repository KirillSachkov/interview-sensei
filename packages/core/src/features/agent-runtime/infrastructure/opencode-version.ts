// What `opencode --version` prints, the only OpenCode command the server runs outside a session.
// The answer picks the config schema of the recipe; see `opencodeConfigSchema`.
import { spawn } from "node:child_process";
import type { ChildProcessByStdio } from "node:child_process";
import { once } from "node:events";
import type { Readable } from "node:stream";
import { text } from "node:stream/consumers";

import type { Timer } from "../../../shared/time/index.ts";

/** How long `opencode --version` may take; it answers in well under a second. */
const versionTimeoutMs = 5000;

type VersionProcess = ChildProcessByStdio<null, Readable, null>;

/** Starts `<binary> --version`, or null when the file is not a program it can start. */
function start(binary: string, env: Readonly<Record<string, string | undefined>>) {
  try {
    const child: VersionProcess = spawn(binary, ["--version"], {
      env,
      stdio: ["ignore", "pipe", "ignore"],
      windowsHide: true,
    });
    return child;
  } catch {
    return null;
  }
}

/** What the process printed once it exited with code 0, or null; it never rejects. */
async function versionOutput(child: VersionProcess): Promise<string | null> {
  try {
    const [output] = await Promise.all([text(child.stdout), once(child, "close")]);
    const version = output.trim();
    return child.exitCode === 0 && version !== "" ? version : null;
  } catch {
    // An `opencode` that is not a program, or output that the timeout cut off.
    return null;
  }
}

/** Kills the process if it still runs and waits for its exit; SIGKILL cannot be ignored. */
async function killed(child: VersionProcess): Promise<void> {
  // A child of the process may still hold stdout open.
  child.stdout.destroy();
  if (child.exitCode === null && child.signalCode === null && child.pid !== undefined) {
    const exited = once(child, "exit");
    child.kill("SIGKILL");
    await exited;
  }
}

/**
 * What `opencode --version` printed, or null when OpenCode is missing, fails, says nothing or
 * does not answer within `versionTimeoutMs` on the timer. Neither 1.x nor 2.x starts a session,
 * reads the config or writes a file for `--version`.
 */
export async function opencodeVersion(
  binary: string | null,
  { env, timer }: { env: Readonly<Record<string, string | undefined>>; timer: Timer },
): Promise<string | null> {
  const child = binary === null ? null : start(binary, env);
  if (child === null) {
    return null;
  }
  const timedOut = Promise.withResolvers<null>();
  const cancel = timer.after(versionTimeoutMs, () => {
    timedOut.resolve(null);
  });
  try {
    return await Promise.race([versionOutput(child), timedOut.promise]);
  } finally {
    cancel();
    await killed(child);
  }
}
