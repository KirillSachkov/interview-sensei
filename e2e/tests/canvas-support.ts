// Helpers of the canvas tests in canvas.test.ts: the zones, the agent menu, the setup chat, the
// onboarding of a new Target and the files of its materials.
import { expect } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";

export const demoName = "Middle backend-разработчик на TypeScript";

/** The Target's canvas with its two zones. */
export function zones(page: Page) {
  const canvas = page.getByRole("region", { name: "Холст цели" });
  return {
    goal: canvas.getByRole("region", { name: "Цель", exact: true }),
    sessions: canvas.getByRole("region", { name: "Сессии", exact: true }),
  };
}

/** The agent list in the message box of the setup chat, before its session starts. */
export function agentSelect(page: Page) {
  return page
    .getByRole("complementary", { name: "Настройка цели" })
    .getByRole("combobox", { name: "Агент" });
}

/** The setup chat beside the canvas; `/tool <name> <json>` makes the fake agent call our tool. */
export function setupChat(page: Page) {
  const panel = page.getByRole("complementary", { name: "Настройка цели" });
  // Only the lists' own items: an agent's Markdown list or a change's details have items too.
  const messages = panel.getByRole("list", { name: "Сообщения" }).locator(":scope > li");
  const changes = panel.getByRole("list", { name: "Изменения черновика" }).locator(":scope > li");
  const callTool = async (name: string, args: object) => {
    const count = await messages.count();
    await panel.getByLabel("Сообщение").fill(`/tool ${name} ${JSON.stringify(args)}`);
    await panel.getByRole("button", { name: "Отправить" }).click();
    await expect(messages).toHaveCount(count + 2);
    await expect(messages.last()).toContainText(`Агент: Результат ${name}:`);
  };
  return { panel, messages, changes, callTool };
}

export const setupPlan = {
  sections: [
    { name: "Опыт и резюме", kind: "conversation", topics: [] },
    { name: "Go и конкурентность", kind: "topics", topics: ["Горутины", "Каналы"] },
  ],
};

/** The draft Target's canvas after «Новая цель»: its setup chat starts the onboarding. */
export async function onboarding(page: Page) {
  await expect(page.getByRole("button", { name: /^Цель без названия\s*черновик/u })).toBeVisible();
  const chat = setupChat(page);
  await expect(chat.messages.first()).toContainText("Агент: Фейковый агент получил");
  return chat;
}

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
export async function openGoSetup(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: demoName }).click();
  await page.getByRole("menuitemradio", { name: "Go-разработчик" }).click();
  const materials = zones(page).goal.getByRole("article", { name: "Материалы" });
  await expect(materials).toContainText("Материалов пока нет");
  const chat = setupChat(page);
  const attached = chat.panel
    .getByRole("list", { name: "Прикреплённые файлы" })
    .getByRole("listitem");
  return { chat, materials, attached };
}

/** Attaches two files by 📎, removes one by ✕ and drops a third onto the message input. */
export async function attachFiles({ panel }: ReturnType<typeof setupChat>, page: Page) {
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

/** «Go-разработчик» on the canvas with its setup chat open. */
export async function openGoChat(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: demoName }).click();
  await page.getByRole("menuitemradio", { name: "Go-разработчик" }).click();
  const chat = setupChat(page);
  // The message box appears with the chat's history, which callTool counts.
  await expect(chat.panel.getByRole("textbox", { name: "Сообщение" })).toBeVisible();
  return chat;
}

export function unapplied(chat: ReturnType<typeof setupChat>, count: number) {
  return chat.panel.getByRole("heading", { name: `Есть неприменённые изменения (${count})` });
}

/**
 * «Новый чат» on the service page, until the server created the chat. The page shows the latest
 * chat meanwhile, which may be another test's empty one: a message typed into it would be lost.
 */
export async function clickNewChat(page: Page) {
  const created = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname === "/api/sessions",
  );
  await page.getByRole("button", { name: "Новый чат" }).click();
  // The page puts the new chat in place of the latest one as soon as it gets this answer.
  const response = await created;
  await response.finished();
}

/** Starts a chat with the fake agent on «Проверка агента», sends «Привет» and gets the reply. */
export async function greetFakeAgent(page: Page) {
  await page
    .getByRole("combobox", { name: "Агент", exact: true })
    .selectOption({ label: "Фейковый агент" });
  await clickNewChat(page);
  const messages = page.getByRole("list", { name: "Сообщения" }).getByRole("listitem");
  await expect(messages).toHaveCount(0);
  await page.getByLabel("Сообщение").fill("Привет");
  await page.getByRole("button", { name: "Отправить" }).click();
  await expect(messages.last()).toHaveText("Агент: Фейковый агент получил: «Привет»");
}

/** The applied plan in the «Цель» zone, and the Target active under its new name. */
export async function expectAppliedPlan(page: Page) {
  const plan = zones(page).goal.getByRole("list", { name: "План собеседования" });
  await expect(plan).toContainText("1Опыт и резюме");
  await expect(plan).toContainText("2Go и конкурентность");
  await expect(plan.getByRole("list", { name: "Темы" })).toHaveText(
    "Горутины: не начатоКаналы: не начато",
  );
  await expect(zones(page).goal).toContainText("Уровень: Senior");
  await expect(page.getByRole("button", { name: "Go-разработчик" })).not.toContainText("черновик");
}

/** «Опорные ответы» of the «Цель» zone, in a view that fits the zone. */
export async function answersCard(page: Page) {
  await page.getByRole("button", { name: "Показать всё" }).click();
  return zones(page).goal.getByRole("article", { name: "Опорные ответы" });
}
