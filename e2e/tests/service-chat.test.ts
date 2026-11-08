// The ticket's acceptance criterion: «Привет» in the service chat gets the fake agent's reply.
import { expect, test } from "@playwright/test";

test("the fake agent answers «Привет» in a new service chat", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Агент").selectOption({ label: "Фейковый агент" });
  await page.getByRole("button", { name: "Новый чат" }).click();
  // The new chat replaces the latest one from earlier runs and has no messages yet.
  const messages = page.getByRole("list", { name: "Сообщения" }).getByRole("listitem");
  await expect(messages).toHaveCount(0);

  // The field turns on when the agent has started; chats of earlier runs keep it off.
  await page.getByLabel("Сообщение").fill("Привет");
  await page.getByRole("button", { name: "Отправить" }).click();

  await expect(messages).toHaveText(["Вы: Привет", "Агент: Фейковый агент получил: «Привет»"]);
});
