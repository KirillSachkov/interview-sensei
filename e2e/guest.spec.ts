import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createServer } from "node:net";
import { promisify } from "node:util";
import { test, expect } from "@playwright/test";
import { guestWorkspace, guestWorkspacePath } from "@sensei/contracts";

test("guest returns after closing Chromium and restarting the API", async ({
  playwright,
}, info) => {
  const socket = createServer();
  await new Promise<void>((resolve) => socket.listen(0, "127.0.0.1", resolve));
  const address = socket.address();
  if (!address || typeof address === "string") throw new Error("Missing port");
  const port = address.port;
  await new Promise<void>((resolve, reject) =>
    socket.close((error) => (error ? reject(error) : resolve())),
  );
  const origin = `http://localhost:${port}`;
  const project = "sensei-" + randomUUID();
  const compose = (...args: string[]) =>
    promisify(execFile)("docker", ["compose", "-p", project, ...args], {
      env: { ...process.env, HTTP_PORT: String(port), PUBLIC_ORIGIN: origin },
      maxBuffer: 16 * 1024 * 1024,
    });
  const ready = () =>
    expect
      .poll(
        async () =>
          fetch(origin)
            .then((r) => r.status)
            .catch(() => 0),
        { timeout: 60000 },
      )
      .toBe(200);
  async function visit(profile: string, width: number, picture?: string) {
    const browser = await playwright.chromium.launchPersistentContext(
      info.outputPath(profile),
      { viewport: { width, height: 800 } },
    );
    try {
      const page = await browser.newPage();
      const response = page.waitForResponse(
        (r) => r.url() === origin + guestWorkspacePath,
      );
      await page.goto(origin);
      const { workspaceId } = guestWorkspace.parse(
        await (await response).json(),
      );
      await expect(
        page.getByRole("heading", {
          name: "К какому собеседованию хочешь подготовиться?",
        }),
      ).toBeVisible();
      if (picture) await page.screenshot({ path: info.outputPath(picture) });
      return workspaceId;
    } finally {
      await browser.close();
    }
  }
  try {
    await compose("build", "api");
    await compose("up", "-d", "--pull", "never");
    await ready();
    await expect
      .poll(async () => (await compose("logs", "worker")).stdout)
      .toContain("Worker ready");
    expect(
      (await compose("ps", "--status", "running", "--services")).stdout.split(
        "\n",
      ),
    ).toContain("worker");
    const first = await visit("profile-a", 1280, "desktop.png");
    await compose("restart", "api");
    await ready();
    const restored = await visit("profile-a", 1280);
    expect(restored).toBe(first);
    const separate = await visit("profile-b", 390, "mobile.png");
    expect(separate).not.toBe(first);
    console.info({ first, restored, separate });
  } finally {
    await compose("down", "-v", "--rmi", "local");
  }
});
