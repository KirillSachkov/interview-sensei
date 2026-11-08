// The ticket's acceptance criterion: «Привет» in the service chat gets the fake agent's reply.
import { expect, test } from "@playwright/test";

test("the fake agent answers «Привет» in a new service chat", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Агент").selectOption({ label: "Фейковый агент" });
  await page.getByRole("button", { name: "Новый чат" }).click();

  await page.getByLabel("Сообщение").fill("Привет");
  // The button turns on when the agent has started and waits for a prompt.
  await page.getByRole("button", { name: "Отправить" }).click();

  const messages = page.getByRole("list", { name: "Сообщения" }).getByRole("listitem");
  await expect(messages).toHaveText(["Вы: Привет", "Агент: Фейковый агент получил: «Привет»"]);
});
