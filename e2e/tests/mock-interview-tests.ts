// The mock interview tests of spec #41 with their helpers. canvas.test.ts declares them after its
// own tests: they work on the demo Target that its first test opens, in the same serial order.
import { expect, test } from "@playwright/test";
import type { Locator } from "@playwright/test";

import { zones } from "./canvas-support.ts";

// Spec #41: the fake agent's interviewer mode takes the Grade from the marker in the answer and
// sends a hint right after it shows a question, which the chat must leave out.

/**
 * «Начать мок-собеседование» of the «Цель» zone opens the window «Начать мок» in the middle of
 * the page; the «Сессии» zone appears once the Target has a Mock interview.
 */
async function openStartWindow(sessions: Locator) {
  const page = sessions.page();
  await page.getByRole("button", { name: "Начать мок-собеседование" }).click();
  return page.getByRole("dialog", { name: "Начать мок" });
}

/** Starts a mock on «Опыт и резюме» only, from the dialog «Начать мок». */
export async function startMock(sessions: Locator) {
  const dialog = await openStartWindow(sessions);
  await dialog.getByRole("checkbox", { name: "TypeScript и Node.js" }).uncheck();
  await dialog.getByRole("checkbox", { name: "Проектирование" }).uncheck();
  await dialog.getByRole("button", { name: "Начать" }).click();
}

/** Answers the card's question; Enter sends the answer. */
export async function answer(card: Locator, text: string) {
  const field = card.getByRole("textbox", { name: "Ваш ответ" });
  await field.fill(text);
  await field.press("Enter");
  await expect(card).toContainText(`Ваш ответ: ${text}`);
}

/** Opens the card's Debrief and checks its Grade. */
export async function openDebrief(card: Locator, grade: string) {
  await card.getByRole("button", { name: "Посмотреть разбор" }).click();
  await expect(card.getByRole("region", { name: "Разбор" })).toContainText(`Оценка: ${grade}`);
}

/** Presses «Завершить» and waits for the interviewer's summary. */
export async function finishMock(sessions: Locator) {
  await sessions.getByRole("button", { name: "Завершить" }).click();
  const result = sessions.getByRole("region", { name: "Итог мока" });
  await expect(result.getByRole("heading", { name: "Мок завершён" })).toBeVisible();
  await expect(result).toContainText("Фейковый интервьюер: мок завершён.");
}

/** The chat shows the reply to the answer, never the hint, and tells that replies are hidden. */
async function expectInterviewerChat(sessions: Locator) {
  const interviewer = sessions.getByRole("complementary", { name: "Интервьюер" });
  await expect(interviewer).toContainText("Ответ получен.");
  await expect(interviewer).not.toContainText("Подсказка до ответа");
  await expect(interviewer).toContainText("Ответы интервьюера скрыты");
}

/**
 * `[followup]`: the interviewer asks a Follow-up and records no Attempt before the finish, so the
 * ended mock shows the answered question without a Grade.
 */
async function finishWithoutGrade(sessions: Locator) {
  const second = sessions.getByRole("article", { name: "Вопрос 2" });
  await answer(second, "Не уверен. [followup]");
  await expect(second).toContainText("Фейковый Follow-up");
  await finishMock(sessions);
  await expect(second).toContainText("Без оценки");
}

// Spec #41, ticket #54: a Dispute corrects the Grade at once, and the summary Debrief shows how the
// Topic status changed.

/** Starts a mock on the one Section, from the dialog «Начать мок». */
async function startMockOn(sessions: Locator, section: string) {
  const dialog = await openStartWindow(sessions);
  for (const other of ["Опыт и резюме", "TypeScript и Node.js", "Проектирование"]) {
    if (other !== section) {
      // oxlint-disable-next-line eslint/no-await-in-loop -- the checkboxes change one after another
      await dialog.getByRole("checkbox", { name: other }).uncheck();
    }
  }
  await dialog.getByRole("button", { name: "Начать" }).click();
}

/** Disputes the Grade in the card's open Debrief: a new Grade and the reason. */
async function disputeGrade(card: Locator, grade: string, reason: string) {
  const debrief = card.getByRole("region", { name: "Разбор" });
  await debrief.getByRole("button", { name: "Оспорить оценку" }).click();
  const form = debrief.getByRole("form", { name: "Оспорить оценку" });
  await form.getByRole("radio", { name: grade, exact: true }).check();
  await form.getByLabel("Причина").fill(reason);
  await form.getByRole("button", { name: "Сохранить" }).click();
}

/** The Debrief shows the corrected Grade «~~1~~ → 3» with the reason. */
async function expectCorrected(card: Locator, reason: string) {
  const debrief = card.getByRole("region", { name: "Разбор" });
  await expect(debrief).toContainText("Оценка: 1 → 3 из 3");
  await expect(debrief).toContainText(`Причина исправления: ${reason}`);
}

/** Finishes the mock; the summary Debrief shows the Topic status change and the unanswered question. */
async function finishWithSummaryDebrief(sessions: Locator) {
  await finishMock(sessions);
  const summary = sessions.getByRole("region", { name: "Итоговый разбор" });
  await expect(summary.getByRole("list", { name: "Изменения тем" })).toContainText(
    "Проектирование сервисов: не начато → шатко",
  );
  await expect(summary).toContainText("Без ответа: 1");
}

/**
 * «Готовность» counts no confident Topic and puts the shaky Topic among those to work on; the
 * Topic's chip on the plan shows the shaky dot, and «Готовность» lists no plan Topics of its own.
 * Chromium puts a space before the visually hidden status in the chip's name.
 */
async function expectReadiness(goal: Locator) {
  const readiness = goal.getByRole("region", { name: "Готовность" });
  await expect(readiness).toContainText("0 из 5 тем уверенно");
  await expect(readiness.getByRole("list", { name: "Подтянуть в первую очередь" })).toContainText(
    "Проектирование сервисов",
  );
  await expect(readiness.getByRole("list", { name: "Темы плана" })).toHaveCount(0);
  const chip = goal
    .getByRole("list", { name: "План собеседования" })
    .getByRole("button", { name: /^Проектирование сервисов ?: шатко$/u });
  await expect(chip.locator(".topic-dot.shaky")).toBeVisible();
}

const disputeReason = "Я назвал сбои и наблюдаемость.";

// Spec #83, ticket #84: «Пауза» stops the mock with the question in place; «Продолжить» goes on in
// a new interviewer session, and the chat keeps the earlier messages.

/** Starts a mock and resolves with its first card, once it takes the answer, and its question. */
async function firstQuestion(sessions: Locator) {
  await startMock(sessions);
  const mock = sessions.getByRole("region", { name: "Мок-собеседование" });
  const first = mock.getByRole("article", { name: "Вопрос 1" });
  await expect(first.getByRole("textbox", { name: "Ваш ответ" })).toBeVisible();
  const question = String(await first.locator(".question-text").textContent());
  return { first, question };
}

/** Pauses the mock: the card waits for «Продолжить» and the timer state says so. */
async function pauseMock(sessions: Locator, card: Locator) {
  await sessions.getByRole("button", { name: "Пауза" }).click();
  await expect(sessions.getByText("на паузе", { exact: true })).toBeVisible();
  await expect(card).toContainText("Ответ — после «Продолжить».");
  await expect(card.getByRole("textbox", { name: "Ваш ответ" })).toHaveCount(0);
}

/** Continues the mock: the same card takes the answer again, and the chat keeps the first session. */
async function continueMock(sessions: Locator, card: Locator) {
  await sessions.getByRole("button", { name: "Продолжить" }).click();
  await expect(card.getByRole("textbox", { name: "Ваш ответ" })).toBeVisible();
  const interviewer = sessions.getByRole("complementary", { name: "Интервьюер" });
  await expect(interviewer).toContainText("Начинаем мок-собеседование.");
}

/** Declares the mock interview tests in the calling test file, in its order. */
export function mockInterviewTests() {
  test("the Candidate starts a mock, answers, opens the Debrief and finishes the mock", async ({
    page,
  }) => {
    await page.goto("/");
    const { sessions } = zones(page);
    await startMock(sessions);

    const first = sessions.getByRole("article", { name: "Вопрос 1" });
    await answer(first, "Я вёл сервис платежей. [grade:3]");
    await openDebrief(first, "3 из 3");
    await expectInterviewerChat(sessions);
    await finishWithoutGrade(sessions);
  });

  test("the Candidate disputes a Grade and sees the summary Debrief with the Topic status changes", async ({
    page,
  }) => {
    await page.goto("/");
    const { goal, sessions } = zones(page);
    const first = sessions.getByRole("article", { name: "Вопрос 1" });
    await startMockOn(sessions, "Проектирование");
    await answer(first, "Очередь, ретраи и идемпотентные обработчики. [grade:1]");
    await openDebrief(first, "1 из 3");

    await disputeGrade(first, "3", disputeReason);

    await expectCorrected(first, disputeReason);
    await finishWithSummaryDebrief(sessions);
    await expectReadiness(goal);
  });

  test("the Candidate pauses the mock, continues it and answers the same question", async ({
    page,
  }) => {
    await page.goto("/");
    const { sessions } = zones(page);
    const { first, question } = await firstQuestion(sessions);

    await pauseMock(sessions, first);
    await continueMock(sessions, first);
    await answer(first, "Ответ после паузы. [grade:2]");

    await expect(first.locator(".question-text")).toHaveText(question);
    await openDebrief(first, "2 из 3");
    await finishMock(sessions);
  });
}
