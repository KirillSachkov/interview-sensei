// The ticket's acceptance criterion: with the server running, «Проверка агента» shows
// «сервер доступен».
import { expect, test } from "@playwright/test";

test("the page shows that the server is available", async ({ page }) => {
  await page.goto("/agent-check");

  await expect(page.getByRole("status")).toHaveText("Сервер доступен");
});
