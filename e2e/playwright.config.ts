import { defineConfig, devices } from "@playwright/test";

// The tests start their own server and web dev server on ports apart from `pnpm dev`
// (4310 and 5173), so a running dev session in this or another worktree does not clash.
const serverPort = process.env.E2E_SERVER_PORT ?? "4320";
const webPort = process.env.E2E_WEB_PORT ?? "5183";
const isCi = Boolean(process.env.CI);

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
    baseURL: `http://127.0.0.1:${webPort}`,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: "pnpm --filter @interview-sensei/server start",
      url: `http://127.0.0.1:${serverPort}/api/health`,
      env: { SERVER_PORT: serverPort },
      reuseExistingServer: false,
    },
    {
      command: "pnpm --filter @interview-sensei/web dev",
      url: `http://127.0.0.1:${webPort}`,
      env: { SERVER_PORT: serverPort, WEB_PORT: webPort },
      reuseExistingServer: false,
    },
  ],
});
