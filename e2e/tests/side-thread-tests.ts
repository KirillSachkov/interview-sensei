// The Side thread tests of spec #80 with their helpers. canvas.test.ts declares them after the
// mock interview tests: they start mocks on the demo Target in the same serial order.
import { expect, test } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";

import { zones } from "./canvas-support.ts";
import { answer, finishMock, openDebrief, startMock } from "./mock-interview-tests.ts";

/**
 * Opens a Side thread at the card with the Candidate's question. The card's own button comes last:
 * an open Debrief inside the card has one too.
 */
async function discussSeparately(card: Locator, question: string) {
  await card.getByRole("button", { name: "Обсудить отдельно" }).last().click();
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

/** The interviewer's greeting before the first question has no «Обсудить отдельно». */
async function expectGreetingWithoutDiscuss(sessions: Locator) {
  const interviewer = sessions.getByRole("complementary", { name: "Интервьюер" });
  const greeting = interviewer
    .getByRole("listitem")
    .filter({ hasText: "Начинаем мок-собеседование." });
  await expect(greeting).toBeVisible();
  await expect(greeting.getByRole("button", { name: "Обсудить отдельно" })).toHaveCount(0);
}

/** Sends `/brief` in the Side thread: the fake agent replies with the Handoff brief as JSON. */
async function askForBrief(thread: Locator) {
  await thread.getByRole("textbox", { name: "Сообщение в ветку" }).fill("/brief");
  await thread.getByRole("button", { name: "Отправить" }).click();
  await expect(thread).toContainText("Фейковый агент прочитал brief");
}

/** Opens the canvas and starts a mock; the first question card and the Side thread beside it. */
async function startedMock(page: Page) {
  const { sessions } = zones(page);
  await page.goto("/");
  await startMock(sessions);
  return {
    sessions,
    first: sessions.getByRole("article", { name: "Вопрос 1" }),
    thread: sessions.getByRole("complementary", { name: "Ветка к вопросу 1" }),
  };
}

// Ticket #81: «Обсудить отдельно» opens a Side thread to the right of the question card.
// A Side thread discusses a question: the greeting before the first one opens none.
function discussTest() {
  test("the Candidate discusses a question in a side thread beside it, and the question gets the hint mark", async ({
    page,
  }) => {
    const { sessions, first, thread } = await startedMock(page);
    const question = "Что значит «вклад»?";

    await discussSeparately(first, question);

    await expectThreadBeside(first, thread, question);
    await expectGreetingWithoutDiscuss(sessions);
    await writeInThread(thread, "А пример?");
    await finishMock(sessions);
  });
}

// Ticket #82: ✕ deletes a Side thread for good after a confirmation; the hint mark stays.
function deleteTest() {
  test("the Candidate deletes a side thread after confirming, and the question keeps the hint mark", async ({
    page,
  }) => {
    const { sessions, first, thread } = await startedMock(page);
    await discussSeparately(first, "Что значит «вклад»?");
    await expect(thread).toContainText("Разбираю вопрос кандидата");

    await deleteThread(thread);

    await expect(first).toContainText("с подсказкой");
    await finishMock(sessions);
  });
}

// The browser records that the Candidate opened the Debrief, so a Side thread at the question
// gets the Grade.
function debriefTest() {
  test("a side thread at the question gets the Grade once the Candidate opened the Debrief", async ({
    page,
  }) => {
    const { sessions, first, thread } = await startedMock(page);
    await answer(first, "Ответ [grade:3] [last]");
    await openDebrief(first, "3");

    await discussSeparately(first, "Почему такая оценка?");
    await askForBrief(thread);

    await expect(thread).toContainText('"grade":3');
    await finishMock(sessions);
  });
}

/** `/crash` in the Side thread: its agent exits, and the thread offers «Продолжить». */
async function crashThreadAgent(thread: Locator) {
  await thread.getByRole("textbox", { name: "Сообщение в ветку" }).fill("/crash");
  await thread.getByRole("button", { name: "Отправить" }).click();
  await expect(thread).toContainText("Агент ветки недоступен или упал");
}

// Ticket #85: «Продолжить» in a Side thread whose agent is gone starts a new agent, and the chat
// keeps the earlier messages. A crash of the agent stands for a restart: the e2e server keeps
// running between tests.
function continueTest() {
  test("the Candidate continues a side thread whose agent stopped, and the chat keeps its messages", async ({
    page,
  }) => {
    const { sessions, first, thread } = await startedMock(page);
    await discussSeparately(first, "Что значит «вклад»?");
    await writeInThread(thread, "А пример?");
    await crashThreadAgent(thread);

    await thread.getByRole("button", { name: "Продолжить" }).click();

    await expect(thread).toContainText("Продолжаю ветку:");
    await expect(thread).toContainText("Фейковый агент получил: «А пример?»");
    await writeInThread(thread, "Ещё вопрос");
    await finishMock(sessions);
  });
}

/** Declares the Side thread tests in the calling test file, in its order. */
export function sideThreadTests() {
  discussTest();
  deleteTest();
  debriefTest();
  continueTest();
}
