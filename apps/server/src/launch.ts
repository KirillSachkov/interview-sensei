#!/usr/bin/env node
// The `interview-sensei` command: the server with the built web app, opened in the browser.
import { access } from "node:fs/promises";
import path from "node:path";

import { openBrowser, opensBrowser } from "./browser.ts";
import { runServer } from "./run-server.ts";

// The output of `pnpm build` in apps/web; Node runs this file from the repository checkout. Tests
// pass another built web app in INTERVIEW_SENSEI_WEB_DIR.
const webDirectory =
  process.env.INTERVIEW_SENSEI_WEB_DIR ?? path.join(import.meta.dirname, "..", "..", "web", "dist");

/** The web app is built when its index.html exists. */
async function isBuilt(): Promise<boolean> {
  try {
    await access(path.join(webDirectory, "index.html"));
    return true;
  } catch {
    return false;
  }
}

if (await isBuilt()) {
  const shouldOpenBrowser = opensBrowser({ args: process.argv.slice(2), env: process.env });
  await runServer({
    webDirectory,
    // Request logs would bury the URL line; the terminal keeps only warnings and errors.
    logLevel: "warn",
    onListening: (url) => {
      process.stdout.write(`Interview Sensei: ${url}\n`);
      if (shouldOpenBrowser) {
        openBrowser(url);
      }
    },
  });
} else {
  process.stderr.write(
    `Веб-приложение не собрано: нет ${webDirectory}. Выполните pnpm build в корне репозитория.\n`,
  );
  process.exitCode = 1;
}
