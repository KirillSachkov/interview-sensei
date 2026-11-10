import { expect, test } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";

import { zones } from "./canvas-support.ts";
import { answer, finishMock, startMock } from "./mock-interview-tests.ts";

async function readyWindows(page: Page) {
  await page.goto("/");
  const { sessions } = zones(page);
  await startMock(sessions);
  const question = sessions.getByRole("article", { name: "Вопрос 1" });
  await question.getByRole("button", { name: "Обсудить отдельно" }).click();
  const threads = sessions.getByRole("complementary", { name: "Ветка к вопросу 1" });
  await expect(threads.first().getByRole("textbox", { name: "Сообщение в ветку" })).toBeEnabled();
  await question.getByRole("button", { name: "Обсудить отдельно" }).click();
  await expect(threads).toHaveCount(2);
  return {
    sessions,
    question,
    threads,
    interviewer: sessions.getByRole("complementary", { name: "Интервьюер" }),
  };
}

/** Inputs keep their shared appearance and models remain outside the message box. */
async function expectSharedInput(window: Locator, sendLabel: string) {
  await expect(window.locator(".composer textarea")).toHaveCSS("min-height", "48px");
  await expect(window.getByRole("button", { name: sendLabel, exact: true })).toHaveCSS(
    "width",
    "36px",
  );
  await expect(window.locator(".composer").getByRole("combobox")).toHaveCount(0);
}

/** The plus belongs inside the card's footer and no longer overlaps its outline. */
async function expectIntegratedAction(question: Locator) {
  const card = await question.boundingBox();
  const action = await question.getByRole("button", { name: "Обсудить отдельно" }).boundingBox();
  expect(action?.x ?? 0).toBeGreaterThan(card?.x ?? 0);
  expect((action?.x ?? 0) + (action?.width ?? 0)).toBeLessThan((card?.x ?? 0) + (card?.width ?? 0));
  expect((action?.y ?? 0) + (action?.height ?? 0)).toBeLessThan(
    (card?.y ?? 0) + (card?.height ?? 0),
  );
}

/** The link spans the whole gap left by a column containing two threads. */
async function expectCompleteLink(first: Locator, second: Locator) {
  const previous = await first.boundingBox();
  const current = await second.boundingBox();
  const link = await second.locator("..").locator("[data-question-link]").boundingBox();
  expect(link).not.toBeNull();
  expect(Math.abs((link?.y ?? 0) - (previous?.y ?? 0) - (previous?.height ?? 0))).toBeLessThan(2);
  expect(Math.abs((link?.y ?? 0) + (link?.height ?? 0) - (current?.y ?? 0))).toBeLessThan(2);
}

async function expectConnectedRows(windows: Awaited<ReturnType<typeof readyWindows>>) {
  await windows.sessions.page().getByRole("button", { name: "Показать всё" }).click();
  await answer(windows.question, "Ответ с двумя ветками. [grade:3]");
  const second = windows.sessions.getByRole("article", { name: "Вопрос 2" });
  await expect(second.getByRole("textbox", { name: "Ваш ответ" })).toBeVisible();
  const nextBox = await second.boundingBox();
  const threadBox = await windows.threads.last().boundingBox();
  expect(nextBox?.y ?? 0).toBeGreaterThan((threadBox?.y ?? 0) + (threadBox?.height ?? 0));
  await expectCompleteLink(windows.question, second);
}

async function expectWindowPresentation(windows: Awaited<ReturnType<typeof readyWindows>>) {
  await expectSharedInput(windows.question, "Ответить");
  await expectSharedInput(windows.threads.first(), "Отправить");
  await expectSharedInput(windows.interviewer, "Отправить");
  await expect(windows.sessions.getByRole("button", { name: /^Изменить размер/u })).toHaveCount(0);
  await expectIntegratedAction(windows.question);
  const arrows = windows.sessions.locator(".side-thread-arrows svg");
  await expect(arrows.locator(".connection-line[marker-end]")).toHaveCount(2);
  await expect(arrows.locator(".connection-trunk")).toHaveCount(2);
}

export function sessionWindowTests() {
  test("session windows share their input, integrate the branch action and connect multiple threads without resizing controls", async ({
    page,
  }) => {
    const windows = await readyWindows(page);
    await expectWindowPresentation(windows);
    await expectConnectedRows(windows);
    await page.getByRole("button", { name: "Показать всё" }).click();
    await finishMock(windows.sessions);
  });
}
