import { spawn } from "node:child_process";

interface BrowserCommand {
  command: string;
  args: string[];
}

/**
 * The system command that opens a URL in the default browser: `open` on macOS, `start` through
 * `cmd` on Windows, `xdg-open` elsewhere. The empty `""` is the window title of `start`.
 */
export function browserCommand(platform: NodeJS.Platform, url: string): BrowserCommand {
  if (platform === "darwin") {
    return { command: "open", args: [url] };
  }
  if (platform === "win32") {
    return { command: "cmd", args: ["/c", "start", '""', url] };
  }
  return { command: "xdg-open", args: [url] };
}

/** Tests, CI and headless machines turn the browser off by flag or variable. */
export function opensBrowser({
  args,
  env,
}: {
  args: readonly string[];
  env: NodeJS.ProcessEnv;
}): boolean {
  return !args.includes("--no-browser") && env.INTERVIEW_SENSEI_NO_BROWSER !== "1";
}

/** Opens the URL in the default browser; a failure only prints the URL to open by hand. */
export function openBrowser(url: string): void {
  const { command, args } = browserCommand(process.platform, url);
  const child = spawn(command, args, {
    detached: true,
    stdio: "ignore",
    // cmd must get `start "" <url>` as written; Node would quote the empty title otherwise.
    windowsVerbatimArguments: true,
  });
  child.once("error", () => {
    process.stderr.write(`Не удалось открыть браузер. Откройте ${url}\n`);
  });
  child.unref();
}
