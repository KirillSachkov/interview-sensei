// The ticket's acceptance criterion: «Привет» in the service chat gets the fake agent's reply.
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

/** Opens the page, starts a chat with the fake agent and returns its message list items. */
async function startNewChat(page: Page) {
  await page.goto("/");
  await page
    .getByRole("combobox", { name: "Агент", exact: true })
    .selectOption({ label: "Фейковый агент" });
  await page.getByRole("button", { name: "Новый чат" }).click();
  // The new chat replaces the latest one from earlier runs and has no messages yet.
  const messages = page.getByRole("list", { name: "Сообщения" }).getByRole("listitem");
  await expect(messages).toHaveCount(0);
  return messages;
}

/** The field turns on when the agent has started; chats of earlier runs keep it off. */
async function sendMessage(page: Page, text: string) {
  await page.getByLabel("Сообщение").fill(text);
  await page.getByRole("button", { name: "Отправить" }).click();
}

test("the fake agent answers «Привет» in a new service chat", async ({ page }) => {
  const messages = await startNewChat(page);

  await sendMessage(page, "Привет");

  await expect(messages).toHaveText(["Вы: Привет", "Агент: Фейковый агент получил: «Привет»"]);
});

test("the chat shows the agent's error answer and takes the next message", async ({ page }) => {
  const messages = await startNewChat(page);

  await sendMessage(page, "/fail");

  await expect(messages.getByRole("alert")).toHaveText(
    "Агент не смог ответить: Фейковый агент не смог ответить. Отправьте сообщение ещё раз.",
  );
  await sendMessage(page, "Привет");
  await expect(messages.last()).toHaveText("Агент: Фейковый агент получил: «Привет»");
});
