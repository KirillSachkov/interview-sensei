import path from "node:path";

import { defineConfig, devices } from "@playwright/test";

// The tests start the built app with the `interview-sensei` command, as the Candidate does, on a
// port apart from `pnpm dev` (4310 and 5173). The root `pnpm test:e2e` builds the web app first.
const serverPort = process.env.E2E_SERVER_PORT ?? "4320";
const isCi = Boolean(process.env.CI);
// The server under test keeps its data here, apart from the Candidate's ~/.interview-sensei.
const dataDirectory = path.join(import.meta.dirname, ".data");

export default defineConfig({
  testDir: "./tests",
  // A test that passes only on a retry is a bug: fix it instead of retrying.
  retries: 0,
  failOnFlakyTests: true,
  forbidOnly: true,
  workers: isCi ? 1 : "50%",
  fullyParallel: true,
  reporter: isCi ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://127.0.0.1:${serverPort}`,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    // --no-browser: Playwright opens its own browser instead of the system one.
    command: "pnpm --dir .. exec interview-sensei --no-browser",
    url: `http://127.0.0.1:${serverPort}/api/health`,
    // The fake ACP agent stands in for a real one, which needs a subscription.
    env: {
      SERVER_PORT: serverPort,
      INTERVIEW_SENSEI_DATA_DIR: dataDirectory,
      INTERVIEW_SENSEI_FAKE_AGENT: "1",
    },
    reuseExistingServer: false,
    // SIGTERM lets the server write its final dump and release the data directory lock.
    gracefulShutdown: { signal: "SIGTERM", timeout: 10_000 },
  },
});
