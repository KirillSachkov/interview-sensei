// Spec #42, seam 3: the canvas frame. The tests share the server's data directory and run in
// order: the first one sees no Targets and opens the demo Target, the rest work on it. No other
// test file creates Targets.
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

test.describe.configure({ mode: "serial" });

const demoName = "Middle backend-разработчик на TypeScript";

/** The Target's canvas with its two zones. */
function zones(page: Page) {
  const canvas = page.getByRole("region", { name: "Холст цели" });
  return {
    goal: canvas.getByRole("region", { name: "Цель", exact: true }),
    sessions: canvas.getByRole("region", { name: "Сессии", exact: true }),
  };
}

function agentButton(page: Page) {
  return page.getByRole("button", { name: /^Агент:/u });
}

test("without Targets the Candidate opens the demo Target onto its canvas", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Целей пока нет" })).toBeVisible();

  await page.getByRole("button", { name: "Открыть демо-цель" }).click();

  await expect(page).toHaveURL(/\/targets\/[0-9a-f-]{36}$/u);
  const { goal, sessions } = zones(page);
  await expect(goal).toContainText(demoName);
  await expect(goal.getByRole("article", { name: "Название и уровень" })).toContainText(
    "Уровень: Middle",
  );
  await expect(sessions).toContainText("Сессий пока нет");
});

test("the app opens on the canvas of the Target", async ({ page }) => {
  await page.goto("/");

  await expect(page).toHaveURL(/\/targets\/[0-9a-f-]{36}$/u);
  await expect(page.getByRole("button", { name: demoName })).toBeVisible();
  await expect(zones(page).goal).toContainText(demoName);
});

/** Opens the agent menu of the top bar and chooses the item with the name. */
async function chooseAgent(page: Page, name: RegExp) {
  await agentButton(page).click();
  await page.getByRole("menu", { name: "Агент цели" }).getByRole("menuitemradio", { name }).click();
}

test("the agent menu shows the default agent and whether each agent is available", async ({
  page,
}) => {
  await page.goto("/");
  await expect(agentButton(page)).toHaveText(/Фейковый агент\s*по умолчанию/u);

  await agentButton(page).click();

  const menu = page.getByRole("menu", { name: "Агент цели" });
  await expect(menu.getByRole("menuitemradio", { checked: true })).toContainText("По умолчанию");
  await expect(menu.getByRole("menuitemradio", { name: /Фейковый агент/u })).toContainText(
    "доступен",
  );
});

test("the chosen agent of the Target stays after a reload", async ({ page }) => {
  await page.goto("/");

  await chooseAgent(page, /Фейковый агент/u);
  await expect(agentButton(page)).not.toContainText("по умолчанию");
  await page.reload();

  await expect(agentButton(page)).toHaveText(/^Агент:\s*Фейковый агент\s*▾$/u);
  await chooseAgent(page, /По умолчанию/u);
  await page.reload();
  await expect(agentButton(page)).toContainText("по умолчанию");
});

/** Starts a chat with the fake agent on «Проверка агента», sends «Привет» and gets the reply. */
async function greetFakeAgent(page: Page) {
  await page
    .getByRole("combobox", { name: "Агент", exact: true })
    .selectOption({ label: "Фейковый агент" });
  await page.getByRole("button", { name: "Новый чат" }).click();
  const messages = page.getByRole("list", { name: "Сообщения" }).getByRole("listitem");
  await expect(messages).toHaveCount(0);
  await page.getByLabel("Сообщение").fill("Привет");
  await page.getByRole("button", { name: "Отправить" }).click();
  await expect(messages.last()).toHaveText("Агент: Фейковый агент получил: «Привет»");
}

test("the top bar leads to «Проверка агента», where the fake agent answers", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("link", { name: "Проверка агента" }).click();

  await expect(page.getByRole("heading", { name: "Проверка агента" })).toBeVisible();
  await greetFakeAgent(page);
  await page.getByRole("link", { name: "← К холсту" }).click();
  await expect(zones(page).goal).toContainText(demoName);
});

function unknownTargetTest(address: string) {
  test(`an unknown Target in the address ${address} shows a message`, async ({ page }) => {
    await page.goto(address);

    await expect(page.getByRole("heading", { name: "Цель не найдена" })).toBeVisible();
    await page.getByRole("link", { name: "К холсту" }).click();
    await expect(zones(page).goal).toContainText(demoName);
  });
}

unknownTargetTest("/targets/00000000-0000-4000-8000-000000000099");
// The server answers 400 to an id that is not a UUID; the page shows the same message.
unknownTargetTest("/targets/unknown");
