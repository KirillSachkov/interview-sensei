// Spec #70, seam 3: «Найти ответы» in the «Цель» zone opens the start window, starts the answer
// search and shows its report. canvas.test.ts declares these tests after the Inbox tests: the test
// creates «Elixir-разработчик» and works only on it.
import { expect, test } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";

import { answerDebriefTests } from "./answer-debrief-tests.ts";
import { answersCard, onboarding } from "./canvas-support.ts";
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

/** «Наполнять в фоне» in the open «Настройки». */
async function fillInBackground(page: Page) {
  await page.getByRole("button", { name: "Настройки" }).click();
  return page
    .getByRole("menu", { name: "Настройки" })
    .getByRole("menuitemcheckbox", { name: /Наполнять в фоне/u });
}

/** Clicks «Наполнять в фоне» from the other state and waits for the stored one. */
async function switchFill(toggle: Locator, to: "true" | "false") {
  await expect(toggle).toHaveAttribute("aria-checked", to === "true" ? "false" : "true");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-checked", to);
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

    test("«Наполнять в фоне» in «Настройки» is off by default and stays on once turned on", async ({
      page,
    }) => {
      await page.goto("/");
      const toggle = await fillInBackground(page);
      await expect(toggle).toContainText("расходует лимиты подписки агента");

      await switchFill(toggle, "true");
      await page.reload();

      const reloaded = await fillInBackground(page);
      await expect(reloaded).toHaveAttribute("aria-checked", "true");
      // The tests after this one expect no answer search after their Inbox processings and mocks.
      await switchFill(reloaded, "false");
    });

    answerDebriefTests();
  });
}
