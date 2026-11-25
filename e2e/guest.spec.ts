import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createServer } from "node:net";
import { promisify } from "node:util";
import { test, expect, type Page } from "@playwright/test";
import { guestWorkspace, guestWorkspacePath } from "@sensei/contracts";
import { startControlledOllama } from "./controlled-ollama.js";

test("guest corrects and resumes a goal setup after closing Chromium and restarting the API", async ({
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
  const model = await startControlledOllama();
  const compose = (...args: string[]) =>
    promisify(execFile)("docker", ["compose", "-p", project, ...args], {
      env: {
        ...process.env,
        HTTP_PORT: String(port),
        PUBLIC_ORIGIN: origin,
        OLLAMA_BASE_URL: model.url,
        OLLAMA_MODEL: "controlled-goal-setup",
      },
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
  async function visit(
    profile: string,
    width: number,
    exercise: (page: Page) => Promise<void>,
  ) {
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
      await expect(textBox(page)).toBeVisible();
      await exercise(page);
      return workspaceId;
    } finally {
      await browser.close();
    }
  }
  const firstMessage = "Хочу готовиться на middle Go";
  const textBox = (page: Page) =>
    page.getByRole("textbox", { name: "Твоя реплика" });
  const send = async (page: Page, message: string) => {
    await textBox(page).fill(message);
    await page.getByRole("button", { name: "Отправить", exact: true }).click();
  };
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
    const first = await visit("profile-a", 1280, async (page) => {
      await page.route(
        "**/turns/*",
        (route) => route.abort("connectionreset"),
        { times: 1 },
      );
      await send(page, firstMessage);
      await expect(textBox(page)).toHaveValue(firstMessage);
      await page.getByRole("button", { name: "Повторить отправку" }).click();
      await expect(
        page.getByText("На каком рынке ищешь работу?"),
      ).toBeVisible();
      await page.reload();
      await expect(
        page.getByText("На каком рынке ищешь работу?"),
      ).toBeVisible();
      expect(model.calls).toEqual([firstMessage]);

      await send(page, "В России");
      await expect(page.getByText("Предложение цели · версия 1")).toBeVisible();
      await page.route(
        "**/turns/*",
        async (route) => {
          const response = await route.fetch();
          expect(response.status()).toBe(200);
          await route.abort("connectionreset");
        },
        { times: 1 },
      );
      await send(page, "Да, только senior");
      await expect(page.getByText("Предложение цели · версия 2")).toBeVisible();
      await expect(
        page.getByText(/уровня senior на российском рынке/),
      ).toBeVisible();
      await page.screenshot({ path: info.outputPath("desktop.png") });
    });
    await compose("restart", "api");
    await ready();
    const restored = await visit("profile-a", 1280, async (page) => {
      await expect(page.getByText(firstMessage)).toBeVisible();
      await expect(page.getByText("Предложение цели · версия 2")).toBeVisible();
      expect(model.calls).toEqual([
        firstMessage,
        "В России",
        "Да, только senior",
      ]);
      await send(page, "А рынок остался тот же?");
      await expect(
        page.getByText("Да, целевой рынок по-прежнему Россия."),
      ).toBeVisible();
      await expect(page.getByText("Предложение цели · версия 2")).toBeVisible();
    });
    expect(restored).toBe(first);
    const separate = await visit("profile-b", 390, async (page) => {
      await expect(textBox(page)).toBeVisible();
      await expect(page.getByText(firstMessage)).toHaveCount(0);
      await page.screenshot({ path: info.outputPath("mobile.png") });
    });
    expect(separate).not.toBe(first);
  } finally {
    try {
      await compose("down", "-v", "--rmi", "local");
    } finally {
      await model.close();
    }
  }
});
