#!/usr/bin/env node
// The `interview-sensei` command: the server with the built web app, opened in the browser, or
// `login opencode`, the application's own OpenCode 2.x login (#69).
import { access } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";

import { systemTimer } from "@interview-sensei/core/time";

import { openBrowser } from "./browser.ts";
import { opencodeLoginModule } from "./composition.ts";
import { launchOptions, usage } from "./launch-options.ts";
import type { LaunchOptions } from "./launch-options.ts";
import { chosenDataDirectory, runServer } from "./run-server.ts";
import { StartError } from "./start-error.ts";

// The built app, the output of `pnpm build` in apps/web: the web build and the application's
// skills beside it. Node runs this file from the repository checkout, or its build from the npm
// package, which keeps the same layout. Tests pass other parts in INTERVIEW_SENSEI_WEB_DIR and
// INTERVIEW_SENSEI_SKILLS_DIR.
const builtApp = path.join(import.meta.dirname, "..", "..", "web", "dist");
const webDirectory = process.env.INTERVIEW_SENSEI_WEB_DIR ?? path.join(builtApp, "web");
const skillsDirectory = process.env.INTERVIEW_SENSEI_SKILLS_DIR ?? path.join(builtApp, "skills");

async function exists(file: string): Promise<boolean> {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

/** What `pnpm build` has not built yet; null when the app is built. */
async function missingPart(): Promise<string | null> {
  if (!(await exists(path.join(webDirectory, "index.html")))) {
    return `Веб-приложение не собрано: нет ${webDirectory}.`;
  }
  if (!(await exists(skillsDirectory))) {
    return `Skills приложения не собраны: нет ${skillsDirectory}.`;
  }
  return null;
}

/** The options of the command line; null after printing why they are wrong. */
function readOptions(): LaunchOptions | null {
  try {
    return launchOptions({ args: process.argv.slice(2), env: process.env });
  } catch (error) {
    if (!(error instanceof StartError)) {
      throw error;
    }
    process.stderr.write(`${error.message}\n\n${usage}`);
    process.exitCode = 1;
    return null;
  }
}

/**
 * The application's own OpenCode 2.x login (#69) in this terminal. It needs no built app and no
 * server: OpenCode writes the login into its database in the data directory.
 */
async function loginOpencode(options: LaunchOptions): Promise<void> {
  const login = opencodeLoginModule({
    dataDirectory: chosenDataDirectory(options.dataDirectory),
    userEnvironment: { home: homedir(), env: process.env },
    timer: systemTimer,
  });
  const result = await login();
  if (result.type === "refused") {
    process.stderr.write(`${result.reason}\n`);
    process.exitCode = 1;
    return;
  }
  process.exitCode = result.code;
}

/** Serves the built app and opens it in the browser. */
async function serve(options: LaunchOptions): Promise<void> {
  const missing = await missingPart();
  if (missing !== null) {
    process.stderr.write(`${missing} Выполните pnpm build в корне репозитория.\n`);
    process.exitCode = 1;
    return;
  }
  await runServer({
    webDirectory,
    skillsDirectory,
    port: options.port,
    ...(options.dataDirectory === undefined ? {} : { dataDirectory: options.dataDirectory }),
    // Request logs would bury the URL line; the terminal keeps only warnings and errors.
    logLevel: "warn",
    onListening: (url) => {
      process.stdout.write(`Interview Sensei: ${url}\n`);
      if (options.openBrowser) {
        openBrowser(url);
      }
    },
  });
}

async function launch(options: LaunchOptions): Promise<void> {
  if (options.help) {
    process.stdout.write(usage);
    return;
  }
  await (options.command === "login-opencode" ? loginOpencode(options) : serve(options));
}

const options = readOptions();
if (options !== null) {
  await launch(options);
}
