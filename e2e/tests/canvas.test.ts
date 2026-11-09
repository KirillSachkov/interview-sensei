// Spec #42, seam 3: the canvas frame; spec #45, seam 3: a new Target and its setup. The tests
// share the server's data directory and run in order: the first one sees no Targets and opens the
// demo Target, the rest work on it. Later Targets sort after the demo, so `/` still opens it. No
// other test file creates Targets.
import { expect, test } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";

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

/** The setup chat beside the canvas; `/tool <name> <json>` makes the fake agent call our tool. */
function setupChat(page: Page) {
  const panel = page.getByRole("complementary", { name: "Настройка цели" });
  const messages = panel.getByRole("list", { name: "Сообщения" }).getByRole("listitem");
  const changes = panel.getByRole("list", { name: "Изменения черновика" }).getByRole("listitem");
  const callTool = async (name: string, args: object) => {
    const count = await messages.count();
    await panel.getByLabel("Сообщение").fill(`/tool ${name} ${JSON.stringify(args)}`);
    await panel.getByRole("button", { name: "Отправить" }).click();
    await expect(messages).toHaveCount(count + 2);
    await expect(messages.last()).toContainText(`Агент: Результат ${name}:`);
  };
  return { panel, messages, changes, callTool };
}

const setupPlan = {
  sections: [
    { name: "Опыт и резюме", kind: "conversation", topics: [] },
    { name: "Go и конкурентность", kind: "topics", topics: ["Горутины", "Каналы"] },
  ],
};

/** The draft Target's canvas after «Новая цель»: its setup chat starts the onboarding. */
async function onboarding(page: Page) {
  await expect(page.getByRole("button", { name: /^Цель без названия\s*черновик/u })).toBeVisible();
  const chat = setupChat(page);
  await expect(chat.messages.first()).toContainText("Агент: Фейковый агент получил");
  return chat;
}

/** The applied plan in the «Цель» zone, and the Target active under its new name. */
async function expectAppliedPlan(page: Page) {
  const plan = zones(page).goal.getByRole("list", { name: "План собеседования" });
  await expect(plan).toContainText("1Опыт и резюме");
  await expect(plan).toContainText("2Go и конкурентность");
  await expect(plan.getByRole("list", { name: "Темы" })).toHaveText("ГорутиныКаналы");
  await expect(zones(page).goal).toContainText("Уровень: Senior");
  await expect(page.getByRole("button", { name: "Go-разработчик" })).not.toContainText("черновик");
}

test("«Новая цель» starts the onboarding, and «Применить» puts the agent's plan on the canvas", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Новая цель" }).click();
  const chat = await onboarding(page);
  await chat.callTool("update_target", { name: "Go-разработчик", level: "senior" });
  await chat.callTool("set_interview_plan", setupPlan);
  await expect(chat.changes).toHaveCount(2);
  await expect(zones(page).goal).not.toContainText("Go и конкурентность");

  await chat.panel.getByRole("button", { name: "Применить (2)" }).click();

  await expectAppliedPlan(page);
  await expect(chat.changes).toHaveCount(0);
});

test("«Настроить цель» returns to the running setup chat", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: demoName }).click();
  await page.getByRole("menuitemradio", { name: "Go-разработчик" }).click();
  const chat = setupChat(page);
  await expect(chat.panel).toBeHidden();

  await zones(page).goal.getByRole("button", { name: "Настроить цель" }).click();

  await expect(chat.messages.first()).toContainText("Агент: Фейковый агент получил");
  await expect(chat.messages.last()).toContainText("Агент: Результат set_interview_plan:");
});

/**
 * Drops the file onto the element as the Candidate drags it from the desktop. The page builds the
 * DataTransfer from a string: the tests compile without the DOM types.
 */
async function dropFile(page: Page, target: Locator, file: { name: string; text: string }) {
  const content = JSON.stringify(file.text);
  const name = JSON.stringify(file.name);
  const dataTransfer = await page.evaluateHandle(`(() => {
    const transfer = new DataTransfer();
    transfer.items.add(new File([${content}], ${name}, { type: "text/plain" }));
    return transfer;
  })()`);
  await target.dispatchEvent("drop", { dataTransfer });
}

/** «Go-разработчик» with its setup chat, from the canvas of the demo Target. */
async function openGoSetup(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: demoName }).click();
  await page.getByRole("menuitemradio", { name: "Go-разработчик" }).click();
  const materials = zones(page).goal.getByRole("article", { name: "Материалы" });
  await expect(materials).toContainText("Материалов пока нет");
  await zones(page).goal.getByRole("button", { name: "Настроить цель" }).click();
  const chat = setupChat(page);
  const attached = chat.panel
    .getByRole("list", { name: "Прикреплённые файлы" })
    .getByRole("listitem");
  return { chat, materials, attached };
}

/** Attaches two files by 📎, removes one by ✕ and drops a third onto the message input. */
async function attachFiles({ panel }: ReturnType<typeof setupChat>, page: Page) {
  await panel.getByLabel("Прикрепить файлы").setInputFiles([
    { name: "vacancy.txt", mimeType: "text/plain", buffer: Buffer.from("Go-разработчик, Kafka") },
    { name: "лишний.txt", mimeType: "text/plain", buffer: Buffer.from("Лишнее") },
  ]);
  await panel.getByRole("button", { name: "Убрать «лишний.txt»" }).click();
  await dropFile(page, panel.getByRole("textbox", { name: "Сообщение" }), {
    name: "resume.txt",
    text: "Пять лет Go",
  });
}

test("files attached in the setup chat go with the message and appear in «Материалы»", async ({
  page,
}) => {
  const { chat, materials, attached } = await openGoSetup(page);
  await attachFiles(chat, page);
  await expect(attached).toHaveText([/vacancy\.txt/u, /resume\.txt/u]);
  await chat.panel.getByLabel("Сообщение").fill("Вот вакансия и резюме");

  await chat.panel.getByRole("button", { name: "Отправить" }).click();

  await expect(chat.messages.last()).toContainText(
    "Прикреплённые файлы: «vacancy.txt», «resume.txt».",
  );
  await expect(attached).toHaveCount(0);
  await expect(materials.getByRole("listitem")).toHaveText([/vacancy\.txt/u, /resume\.txt/u]);
});

/** «Go-разработчик» on the canvas with its setup chat open. */
async function openGoChat(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: demoName }).click();
  await page.getByRole("menuitemradio", { name: "Go-разработчик" }).click();
  await zones(page).goal.getByRole("button", { name: "Настроить цель" }).click();
  const chat = setupChat(page);
  // The message box appears with the chat's history, which callTool counts.
  await expect(chat.panel.getByRole("textbox", { name: "Сообщение" })).toBeVisible();
  return chat;
}

function unapplied(chat: ReturnType<typeof setupChat>, count: number) {
  return chat.panel.getByRole("heading", { name: `Есть неприменённые изменения (${count})` });
}

test("after a reload the setup chat shows «Есть неприменённые изменения», and ✕ removes one", async ({
  page,
}) => {
  const chat = await openGoChat(page);
  await chat.callTool("update_target", { tone: "strict" });
  await chat.callTool("update_target", { language: "en" });

  await page.reload();

  await zones(page).goal.getByRole("button", { name: "Настроить цель" }).click();
  await expect(unapplied(chat, 2)).toBeVisible();
  await chat.panel.getByRole("button", { name: "Убрать изменение: Цель: язык en" }).click();
  await expect(unapplied(chat, 1)).toBeVisible();
  await expect(chat.changes).toHaveText([/^Цель: тон строгий/u]);
});

test("«Завершить» with a non-empty draft asks what to do with it", async ({ page }) => {
  const chat = await openGoChat(page);
  const finish = async (choice: string) => {
    await chat.panel.getByRole("button", { name: "Завершить" }).click();
    await chat.panel.getByRole("dialog").getByRole("button", { name: choice }).click();
    await expect(chat.panel).toBeHidden();
    await zones(page).goal.getByRole("button", { name: "Настроить цель" }).click();
  };

  await finish("Оставить черновик");

  await expect(unapplied(chat, 1)).toBeVisible();
  await finish("Отменить изменения");
  await expect(chat.panel.getByRole("list", { name: "Сообщения" })).toBeVisible();
  await expect(chat.changes).toHaveCount(0);
  await expect(zones(page).goal).toContainText("Go-разработчик");
});
