// Spec #70, story 21: the Debrief of an Attempt shows the asked Question's reference answer,
// read-only, as the side panel shows it. answerTests declares this test, after the Inbox tests and
// before the mock interview tests: it works on the demo Target and finishes its mock.
import { expect, test } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";

import { answersCard, zones } from "./canvas-support.ts";
import { answer, finishMock, openDebrief, startMock } from "./mock-interview-tests.ts";

/** Fills the reference answers of the asked Questions: they go first in the queue. */
async function findAnswers(page: Page) {
  const card = await answersCard(page);
  await card.getByRole("button", { name: "Найти ответы" }).click();
  const window = card.getByRole("dialog", { name: "Найти опорные ответы" });
  await window.getByRole("button", { name: "Начать поиск" }).click();
  await expect(card.getByRole("button", { name: "Отчёт о наполнении" })).toBeVisible();
}

/** The open Debrief shows the fake researcher's answer with its label, and no field to edit it. */
async function expectReferenceAnswer(debrief: Locator) {
  await expect(debrief).toContainText(/Опорный ответ\s*из (?:интернета|знаний агента)/u);
  await debrief.getByText("Опорный ответ").click();
  await expect(debrief).toContainText("Короткий ответ на вопрос «");
  await expect(debrief.getByRole("textbox")).toHaveCount(0);
}

/** A mock on the demo Target whose first question has its Attempt. */
async function answeredMock(page: Page) {
  await page.goto("/");
  const { sessions } = zones(page);
  await startMock(sessions);
  const first = sessions.getByRole("article", { name: "Вопрос 1" });
  await answer(first, "Я вёл сервис платежей. [grade:2]");
  await expect(first.getByRole("button", { name: "Посмотреть разбор" })).toBeVisible();
  return { sessions, first };
}

export function answerDebriefTests() {
  test("the Debrief shows the asked Question's reference answer, read-only, once answer search filled it", async ({
    page,
  }) => {
    const { sessions, first } = await answeredMock(page);

    await findAnswers(page);
    await openDebrief(first, "2 из 3");

    await expectReferenceAnswer(first.getByRole("region", { name: "Разбор" }));
    await finishMock(sessions);
  });
}
