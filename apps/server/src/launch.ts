#!/usr/bin/env node
// The `interview-sensei` command: the server with the built web app, opened in the browser.
import { access } from "node:fs/promises";
import path from "node:path";

import { openBrowser, opensBrowser } from "./browser.ts";
import { runServer } from "./run-server.ts";

// The output of `pnpm build` in apps/web; Node runs this file from the repository checkout.
const webDirectory = path.join(import.meta.dirname, "..", "..", "web", "dist");

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
  const browser = opensBrowser({ args: process.argv.slice(2), env: process.env });
  await runServer({
    webDirectory,
    onListening: (url) => {
      process.stdout.write(`Interview Sensei: ${url}\n`);
      if (browser) {
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
