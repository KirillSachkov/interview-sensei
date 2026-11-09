// Helpers of the canvas tests in canvas.test.ts: the zones, the setup chat, the onboarding of a
// new Target and the files of its materials.
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

/** The setup chat beside the canvas; `/tool <name> <json>` makes the fake agent call our tool. */
export function setupChat(page: Page) {
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
  await zones(page).goal.getByRole("button", { name: "Настроить цель" }).click();
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
