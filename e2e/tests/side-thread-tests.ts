// The Side thread tests of spec #80 with their helpers. canvas.test.ts declares them after the
// mock interview tests: they start mocks on the demo Target in the same serial order.
import { expect, test } from "@playwright/test";
import type { Locator } from "@playwright/test";

import { zones } from "./canvas-support.ts";
import { finishMock, startMock } from "./mock-interview-tests.ts";

/** Opens a Side thread at the card with the Candidate's question. */
async function discussSeparately(card: Locator, question: string) {
  await card.getByRole("button", { name: "Обсудить отдельно" }).click();
  const form = card.getByRole("form", { name: "Обсудить отдельно" });
  await form.getByRole("textbox", { name: "Ваш вопрос" }).fill(question);
  await form.getByRole("button", { name: "Открыть ветку" }).click();
}

/** Writes in the Side thread and waits for the agent's reply. */
async function writeInThread(thread: Locator, text: string) {
  await thread.getByRole("textbox", { name: "Сообщение в ветку" }).fill(text);
  await thread.getByRole("button", { name: "Отправить" }).click();
  await expect(thread).toContainText(`Фейковый агент получил: «${text}»`);
}

/** ✕ on the Side thread, then «Удалить» in its confirmation; the thread leaves the canvas. */
async function deleteThread(thread: Locator) {
  await thread.getByRole("button", { name: "Удалить ветку" }).click();
  const confirm = thread.getByRole("alertdialog", { name: "Удалить ветку?" });
  await expect(confirm).toContainText("пометка «с подсказкой» у вопроса останется");
  await confirm.getByRole("button", { name: "Удалить" }).click();
  await expect(thread).toHaveCount(0);
}

/** The thread right of the card answers the question; the card shows «с подсказкой». */
async function expectThreadBeside(card: Locator, thread: Locator, question: string) {
  await expect(thread).toContainText(`Разбираю вопрос кандидата: «${question}»`);
  const cardBox = await card.boundingBox();
  const threadBox = await thread.boundingBox();
  expect(threadBox?.x ?? 0).toBeGreaterThan((cardBox?.x ?? 0) + (cardBox?.width ?? 0));
  await expect(card).toContainText("с подсказкой");
}

/** Declares the Side thread tests in the calling test file, in its order. */
export function sideThreadTests() {
  // Ticket #81: «Обсудить отдельно» opens a Side thread to the right of the question card.
  test("the Candidate discusses a question in a side thread beside it, and the question gets the hint mark", async ({
    page,
  }) => {
    await page.goto("/");
    const { sessions } = zones(page);
    await startMock(sessions);
    const first = sessions.getByRole("article", { name: "Вопрос 1" });
    const question = "Что значит «вклад»?";

    await discussSeparately(first, question);

    const thread = sessions.getByRole("complementary", { name: "Ветка к вопросу 1" });
    await expectThreadBeside(first, thread, question);
    await writeInThread(thread, "А пример?");
    await finishMock(sessions);
  });

  // Ticket #82: ✕ deletes a Side thread for good after a confirmation; the hint mark stays.
  test("the Candidate deletes a side thread after confirming, and the question keeps the hint mark", async ({
    page,
  }) => {
    const { sessions } = zones(page);
    const first = sessions.getByRole("article", { name: "Вопрос 1" });
    const thread = sessions.getByRole("complementary", { name: "Ветка к вопросу 1" });
    await page.goto("/");
    await startMock(sessions);
    await discussSeparately(first, "Что значит «вклад»?");
    await expect(thread).toContainText("Разбираю вопрос кандидата");

    await deleteThread(thread);

    await expect(first).toContainText("с подсказкой");
    await finishMock(sessions);
  });
}
