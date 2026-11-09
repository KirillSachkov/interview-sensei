// The setup chat tests of the live check of spec #45 (D1, D2) with their helpers. canvas.test.ts
// declares them after its own tests: «Новая цель» creates «Python-разработчик», and the next
// test works on it in the same serial order.
import { expect, test } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";

import { onboarding, setupChat, zones } from "./canvas-support.ts";
import { openTarget } from "./target-actions.ts";

const pythonName = "Python-разработчик";

const pythonPlan = {
  sections: [
    { name: "Опыт и резюме", kind: "conversation", topics: [] },
    { name: "Python", kind: "topics", topics: ["Генераторы", "GIL"] },
  ],
};

/** As many Questions as a real agent records at once in the onboarding (56 in the live check). */
const manyQuestions = Array.from({ length: 56 }, (_item, index) => ({
  topic: index % 2 === 0 ? "Генераторы" : "GIL",
  text: `Вопрос ${index + 1}: расскажите, как вы применяли генераторы и что мешало в проекте?`,
}));

/** The element is on the screen and inside the setup chat's panel, not pushed out of it. */
async function expectInPanel(panel: Locator, element: Locator) {
  await expect(element).toBeInViewport();
  const [outer, inner] = await Promise.all([panel.boundingBox(), element.boundingBox()]);
  expect(inner?.y ?? 0).toBeGreaterThanOrEqual(outer?.y ?? 0);
  expect((inner?.y ?? 0) + (inner?.height ?? 0)).toBeLessThanOrEqual(
    (outer?.y ?? 0) + (outer?.height ?? 0),
  );
}

/** Sends a short message and waits for the fake agent's echo. */
async function sendMessage(chat: ReturnType<typeof setupChat>, text: string) {
  await chat.panel.getByLabel("Сообщение").fill(text);
  await chat.panel.getByRole("button", { name: "Отправить" }).click();
  await expect(chat.messages.last()).toContainText(`Фейковый агент получил: «${text}»`);
}

/** «Python-разработчик» with its running setup chat open and its history loaded. */
async function openPythonChat(page: Page) {
  await openTarget(page, pythonName);
  await zones(page).goal.getByRole("button", { name: "Настроить цель" }).click();
  const chat = setupChat(page);
  // The message box appears with the chat's history, which callTool counts.
  await expect(chat.panel.getByRole("textbox", { name: "Сообщение" })).toBeVisible();
  return chat;
}

export function setupChatTests() {
  test.describe("the setup chat beside a large screen's canvas", () => {
    // The live check ran on a 1600×1000 window, where the whole chat panel is on the screen.
    test.use({ viewport: { width: 1600, height: 1000 } });

    test("the agent's apply_changes puts the plan on the canvas without a reload", async ({
      page,
    }) => {
      await page.goto("/");
      await page.getByRole("button", { name: "Новая цель" }).click();
      const chat = await onboarding(page);
      await chat.callTool("update_target", { name: pythonName, level: "middle" });
      await chat.callTool("set_interview_plan", pythonPlan);

      await chat.callTool("apply_changes", {});

      const plan = zones(page).goal.getByRole("list", { name: "План собеседования" });
      await expect(plan.getByRole("list", { name: "Темы" })).toHaveText("ГенераторыGIL");
      await expect(zones(page).goal).toContainText("Уровень: Middle");
      await expect(page.getByRole("button", { name: pythonName })).not.toContainText("черновик");
    });

    test("a long draft keeps the chat's last message, input and «Применить» in the panel", async ({
      page,
    }) => {
      const chat = await openPythonChat(page);
      await chat.callTool("add_questions", { questions: manyQuestions });

      await sendMessage(chat, "Что дальше?");

      await expect(chat.changes).toHaveText([/^Вопросы: добавить 56 вопросов/u]);
      for (const element of [
        chat.messages.last(),
        chat.panel.getByRole("textbox", { name: "Сообщение" }),
        chat.panel.getByRole("button", { name: "Применить (1)" }),
      ]) {
        // oxlint-disable-next-line eslint/no-await-in-loop -- one element after another on one page
        await expectInPanel(chat.panel, element);
      }
      await chat.panel.getByRole("button", { name: "Отменить изменения" }).click();
      await expect(chat.changes).toHaveCount(0);
    });
  });
}
