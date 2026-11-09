// The Candidate's steps on the Target's canvas that the e2e tests share: the zones, a mock
// interview and its Side threads. Only canvas.test.ts creates Targets; see its header.
import { expect } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";

/** The Target's canvas with its two zones. */
export function zones(page: Page) {
  const canvas = page.getByRole("region", { name: "Холст цели" });
  return {
    goal: canvas.getByRole("region", { name: "Цель", exact: true }),
    sessions: canvas.getByRole("region", { name: "Сессии", exact: true }),
  };
}

/** Starts a mock on «Опыт и резюме» only, from the dialog «Начать мок». */
export async function startMock(sessions: Locator) {
  await sessions.getByRole("button", { name: "Начать мок" }).click();
  const dialog = sessions.getByRole("dialog", { name: "Начать мок" });
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

/** Starts a mock on the one Section, from the dialog «Начать мок». */
export async function startMockOn(sessions: Locator, section: string) {
  await sessions.getByRole("button", { name: "Начать мок" }).click();
  const dialog = sessions.getByRole("dialog", { name: "Начать мок" });
  for (const other of ["Опыт и резюме", "TypeScript и Node.js", "Проектирование"]) {
    if (other !== section) {
      // oxlint-disable-next-line eslint/no-await-in-loop -- the checkboxes change one after another
      await dialog.getByRole("checkbox", { name: other }).uncheck();
    }
  }
  await dialog.getByRole("button", { name: "Начать" }).click();
}

/** Opens a Side thread at the card with the Candidate's question. */
export async function discussSeparately(card: Locator, question: string) {
  await card.getByRole("button", { name: "Обсудить отдельно" }).click();
  const form = card.getByRole("form", { name: "Обсудить отдельно" });
  await form.getByRole("textbox", { name: "Ваш вопрос" }).fill(question);
  await form.getByRole("button", { name: "Открыть ветку" }).click();
}

/** Writes in the Side thread and waits for the agent's reply. */
export async function writeInThread(thread: Locator, text: string) {
  await thread.getByRole("textbox", { name: "Сообщение в ветку" }).fill(text);
  await thread.getByRole("button", { name: "Отправить" }).click();
  await expect(thread).toContainText(`Фейковый агент получил: «${text}»`);
}

/** ✕ on the Side thread, then «Удалить» in its confirmation; the thread leaves the canvas. */
export async function deleteThread(thread: Locator) {
  await thread.getByRole("button", { name: "Удалить ветку" }).click();
  const confirm = thread.getByRole("alertdialog", { name: "Удалить ветку?" });
  await expect(confirm).toContainText("пометка «с подсказкой» у вопроса останется");
  await confirm.getByRole("button", { name: "Удалить" }).click();
  await expect(thread).toHaveCount(0);
}
