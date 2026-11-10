// Spec #70, seam 3: «Найти ответы» in the «Цель» zone opens the start window, starts the answer
// search and shows its report. canvas.test.ts declares these tests after the Inbox tests: the test
// creates «Elixir-разработчик» and works only on it.
import { expect, test } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";

import { onboarding, zones } from "./canvas-support.ts";
import type { setupChat } from "./canvas-support.ts";

const elixirName = "Elixir-разработчик";

/** A new Target «Elixir-разработчик» with two Questions without a reference answer. */
async function newElixirTarget(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Новая цель" }).click();
  const chat = await onboarding(page);
  await chat.callTool("update_target", { name: elixirName, level: "middle" });
  await chat.callTool("set_interview_plan", {
    sections: [{ name: "Elixir", kind: "topics", topics: ["Процессы"] }],
  });
  await chat.callTool("add_questions", {
    questions: [
      { topic: "Процессы", text: "Что такое процесс в BEAM?" },
      { topic: "Процессы", text: "Зачем нужен супервизор?" },
    ],
  });
  await chat.callTool("apply_changes", {});
  await expect(page.getByRole("button", { name: elixirName })).toBeVisible();
  await hideAfterTurn(chat);
  return answersCard(page);
}

/**
 * Hides the setup chat once the agent's turn ends: the page reloads the Target's views then, and a
 * hidden chat would miss it. The fake agent streams the long reply of apply_changes word by word.
 */
async function hideAfterTurn(chat: ReturnType<typeof setupChat>) {
  await expect(chat.panel.getByText("Агент работает…")).toBeHidden({ timeout: 20_000 });
  await chat.panel.getByRole("button", { name: "Скрыть" }).click();
}

/** «Опорные ответы» of the «Цель» zone, in a view that fits the zone. */
async function answersCard(page: Page) {
  await page.getByRole("button", { name: "Показать всё" }).click();
  return zones(page).goal.getByRole("article", { name: "Опорные ответы" });
}

/** Opens the start window and checks its count, its default choice and its warning. */
async function openStartWindow(card: Locator) {
  await expect(card).toContainText("Без опорного ответа: 2");
  await card.getByRole("button", { name: "Найти ответы" }).click();
  const window = card.getByRole("dialog", { name: "Найти опорные ответы" });
  await expect(window).toContainText("Без опорного ответа: 2");
  await expect(window.getByRole("spinbutton", { name: "Сколько наполнить" })).toHaveValue("2");
  await expect(window).toContainText("расходует лимиты подписки агента");
  return window;
}

/** Opens the latest answer report and checks its counts and the token usage. */
async function expectReport(page: Page, card: Locator) {
  await card.getByRole("button", { name: "Отчёт о наполнении" }).click();
  const report = page.getByRole("complementary", { name: "Отчёт о наполнении ответов" });
  await expect(report).toContainText("Наполнено: 2 из 2");
  await expect(report).toContainText("Из интернета: 1");
  await expect(report).toContainText("Из знаний агента: 1");
  await expect(report).toContainText(/Расход: 4\s321 токенов/u);
}

export function answerTests() {
  test.describe("answer search from the «Цель» zone", () => {
    test.use({ viewport: { width: 1600, height: 1000 } });

    test("«Найти ответы» opens the window with the count and the warning, starts the search and shows the report", async ({
      page,
    }) => {
      const card = await newElixirTarget(page);
      const window = await openStartWindow(card);

      await window.getByRole("button", { name: "Начать поиск" }).click();

      await expect(card).toContainText("Без опорного ответа: 0");
      await expectReport(page, card);
    });
  });
}
