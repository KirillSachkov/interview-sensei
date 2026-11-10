// Helpers of the canvas tests of ticket #51: the plan's manual actions, the side panel of
// Questions, «Меню цели» and «Архив».
import { expect } from "@playwright/test";
import type { Page } from "@playwright/test";

import { demoName, onboarding, setupChat, setupPlan, zones } from "./canvas-support.ts";

export const kotlinName = "Kotlin-разработчик";

/** A new Target «Kotlin-разработчик» with the applied plan; its setup session keeps running. */
export async function newKotlinTarget(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Новая цель" }).click();
  const chat = await onboarding(page);
  await chat.callTool("update_target", { name: kotlinName, level: "middle" });
  await chat.callTool("set_interview_plan", setupPlan);
  await chat.panel.getByRole("button", { name: "Применить (2)" }).click();
  const { goal } = zones(page);
  await expect(goal.getByRole("list", { name: "План собеседования" })).toBeVisible();
  // The canvas fitted its view once, to whatever content had loaded by then, so the plan could
  // end up under the zoom island. «Показать всё» fits the view to the loaded plan and «Готовность».
  await expect(goal.getByRole("region", { name: "Готовность" })).toContainText("0 из 2");
  await page.getByRole("button", { name: "Показать всё" }).click();
}

/** The item of the Target in the switcher's menu, opened from the start page. */
export function switcherItem(page: Page, name: string | RegExp) {
  return page.getByRole("menu", { name: "Цели" }).getByRole("menuitemradio", { name });
}

/** Opens the switcher on the demo Target's canvas; its items are then in `switcherItem`. */
export async function openSwitcher(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: demoName }).click();
}

/** Opens the canvas of the Target from the switcher on the demo Target's canvas. */
export async function openTarget(page: Page, name: string) {
  await openSwitcher(page);
  await switcherItem(page, name).click();
  await expect(zones(page).goal).toContainText(name);
}

/** One Section of the plan in the «Цель» zone. */
export function sectionBlock(page: Page, name: string) {
  return zones(page)
    .goal.getByRole("list", { name: "План собеседования" })
    .getByRole("listitem", { name, exact: true });
}

/** The side panel of the demo Topic «Асинхронность Node.js», with its first Question's text. */
export async function demoQuestions(page: Page) {
  await page.goto("/");
  await sectionBlock(page, "TypeScript и Node.js")
    .getByRole("button", { name: "Асинхронность Node.js" })
    .click();
  const panel = page.getByRole("complementary", { name: "Вопросы: Асинхронность Node.js" });
  const visible = panel.getByRole("region", { name: "Вопросы", exact: true }).getByRole("listitem");
  const hidden = panel.getByRole("region", { name: "Скрытые вопросы" }).getByRole("listitem");
  await expect(visible.first()).toBeVisible();
  const first = (await visible.first().locator("p").textContent()) ?? "";
  return { visible, hidden, count: await visible.count(), first };
}

/** Opens «Меню цели» in the top bar and returns its «В архив». */
async function archiveItem(page: Page) {
  await page.getByRole("button", { name: "Меню цели" }).click();
  return page.getByRole("menu", { name: "Меню цели" }).getByRole("menuitem", { name: /В архив/u });
}

/** «В архив» is disabled while an agent session of the Target runs; the menu closes again. */
export async function expectArchiveUnavailable(page: Page) {
  const item = await archiveItem(page);
  await expect(item).toBeDisabled();
  await expect(item).toContainText("недоступно, пока идёт сессия агента");
  await page.keyboard.press("Escape");
}

/** Moves the current Target to the archive with «Меню цели». */
export async function archiveCurrent(page: Page) {
  const item = await archiveItem(page);
  await item.click();
}

/** Ends the Target's setup session with «Завершить»; its draft of changes is empty. */
export async function finishSetup(page: Page) {
  const chat = setupChat(page);
  await chat.panel.getByRole("button", { name: "Завершить" }).click();
  // The chat stays open and waits for the first message of a new session.
  await expect(chat.panel.getByText("Агент запустится с вашим первым сообщением")).toBeVisible();
}

/** The list «Архивные цели» on the page «Архив». */
export function archivedTargets(page: Page) {
  return page.getByRole("list", { name: "Архивные цели" }).getByRole("listitem");
}

/** The deletion form of the archived Target on «Архив»: its name field and its confirmation. */
export async function deletionForm(page: Page, name: string) {
  await page.goto("/archive");
  const item = archivedTargets(page).filter({ hasText: name });
  await item.getByRole("button", { name: "Удалить навсегда" }).click();
  const form = item.getByRole("form");
  return {
    name: form.getByRole("textbox"),
    confirm: form.getByRole("button", { name: "Удалить навсегда" }),
  };
}
