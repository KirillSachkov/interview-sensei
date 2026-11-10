import { expect, test } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";

import { zones } from "./canvas-support.ts";
import { answer, finishMock, startMock } from "./mock-interview-tests.ts";

interface WindowBox {
  offsetWidth: number;
  offsetHeight: number;
}

function size(window: Locator) {
  return window.evaluate(({ offsetWidth, offsetHeight }: WindowBox) => ({
    width: offsetWidth,
    height: offsetHeight,
  }));
}

async function readyWindows(page: Page) {
  await page.goto("/");
  const { sessions } = zones(page);
  await startMock(sessions);
  const question = sessions.getByRole("article", { name: "Вопрос 1" });
  await question.getByRole("button", { name: "Обсудить отдельно" }).click();
  const thread = sessions.getByRole("complementary", { name: "Ветка к вопросу 1" });
  await expect(thread.getByRole("textbox", { name: "Сообщение в ветку" })).toBeEnabled();
  return {
    sessions,
    question,
    thread,
    interviewer: sessions.getByRole("complementary", { name: "Интервьюер" }),
  };
}

/** The same send button and writing area, with model controls outside the composer. */
async function expectSharedInput(window: Locator, sendLabel: string) {
  await expect(window.locator(".composer textarea")).toHaveCSS("min-height", "96px");
  await expect(window.getByRole("button", { name: sendLabel, exact: true })).toHaveCSS(
    "width",
    "36px",
  );
  await expect(window.locator(".composer").getByRole("combobox")).toHaveCount(0);
}

async function growWithKeyboard(window: Locator, label: string) {
  const before = await size(window);
  const handle = window.getByRole("button", { name: `Изменить размер ${label}` });
  await handle.press("ArrowRight");
  await handle.press("ArrowDown");
  const after = await size(window);
  expect(after.width).toBe(before.width + 32);
  expect(after.height).toBeGreaterThan(before.height);
}

/** A large pointer movement still ends at the branch's bounds, at the current canvas zoom. */
async function dragToLimit(page: Page, thread: Locator) {
  const handle = thread.getByRole("button", { name: "Изменить размер ветки" });
  await handle.hover();
  const box = await handle.boundingBox();
  if (box === null) {
    throw new Error("Угол ветки не появился");
  }
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + 1200, box.y + 1200, { steps: 10 });
  await page.mouse.up();
  await expect.poll(async () => size(thread)).toEqual({ width: 960, height: 1000 });
}

async function expectNextRowBelow(sessions: Locator, thread: Locator) {
  const second = sessions.getByRole("article", { name: "Вопрос 2" });
  await expect(second.getByRole("textbox", { name: "Ваш ответ" })).toBeVisible();
  const nextBox = await second.boundingBox();
  const threadBox = await thread.boundingBox();
  expect(nextBox?.y ?? 0).toBeGreaterThan((threadBox?.y ?? 0) + (threadBox?.height ?? 0));
}

async function resizeAndCheck(page: Page, windows: Awaited<ReturnType<typeof readyWindows>>) {
  await expectSharedInput(windows.question, "Ответить");
  await expectSharedInput(windows.thread, "Отправить");
  await expectSharedInput(windows.interviewer, "Отправить");
  await growWithKeyboard(windows.question, "карточки вопроса");
  await growWithKeyboard(windows.interviewer, "интервьюера");
  await page.setViewportSize({ width: 2400, height: 2200 });
  await dragToLimit(page, windows.thread);
  await answer(windows.question, "Ответ после растягивания. [grade:3]");
  await expectNextRowBelow(windows.sessions, windows.thread);
}

export function sessionWindowTests() {
  test("session windows share their input, resize within bounds, move neighboring rows and keep their size after reload", async ({
    page,
  }) => {
    const windows = await readyWindows(page);
    await resizeAndCheck(page, windows);
    await page.reload();
    await expect.poll(async () => size(windows.thread)).toEqual({ width: 960, height: 1000 });
    await expect.poll(async () => size(windows.question)).toMatchObject({ width: 672 });
    await page.getByRole("button", { name: "Показать всё" }).click();
    await finishMock(windows.sessions);
  });
}
