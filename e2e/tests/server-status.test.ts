// The ticket's acceptance criterion: with the server running, the web page shows «сервер доступен».
import { expect, test } from "@playwright/test";

test("the page shows that the server is available", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("status")).toHaveText("Сервер доступен");
});
