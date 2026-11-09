// Spec #42, seam 3: the canvas frame; spec #45, seam 3: a new Target, its setup and the manual
// actions; spec #47: Inbox processing; spec #41: the mock interview, last. The tests share the server's data directory and run
// in order: the first one sees no Targets and opens the demo Target, the rest work on it. Later
// Targets sort after the demo, so `/` still opens it. No other test file creates Targets. Only
// Targets that a test created go to the archive or away; changes of the demo Target are undone in
// the same test.
import { expect, test } from "@playwright/test";

import {
  agentButton,
  attachFiles,
  chooseAgent,
  demoName,
  expectAppliedPlan,
  greetFakeAgent,
  onboarding,
  openGoChat,
  openGoSetup,
  setupChat,
  setupPlan,
  unapplied,
  zones,
} from "./canvas-support.ts";
import {
  archiveCurrent,
  archivedTargets,
  deletionForm,
  demoQuestions,
  expectArchiveUnavailable,
  kotlinName,
  newKotlinTarget,
  openSwitcher,
  openTarget,
  sectionBlock,
  finishSetup,
  switcherItem,
} from "./target-actions.ts";
import { inboxTests } from "./inbox-tests.ts";
import { mockInterviewTests } from "./mock-interview-tests.ts";
import { setupChatTests } from "./setup-chat-tests.ts";

test.describe.configure({ mode: "serial" });

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

test("«Новая цель» starts the onboarding, and «Применить» puts the agent's plan on the canvas", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Новая цель" }).click();
  const chat = await onboarding(page);
  await chat.callTool("update_target", { name: "Go-разработчик", level: "senior" });
  await chat.callTool("set_interview_plan", setupPlan);
  await expect(chat.changes).toHaveCount(2);
  await expect(zones(page).goal.getByRole("list", { name: "План собеседования" })).toHaveCount(0);

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

test("after a reload the setup chat shows «Есть неприменённые изменения», and ✕ removes one", async ({
  page,
}) => {
  const chat = await openGoChat(page);
  await chat.callTool("update_target", { tone: "strict" });
  await chat.callTool("update_target", { language: "en" });

  await page.reload();

  await zones(page).goal.getByRole("button", { name: "Настроить цель" }).click();
  await expect(unapplied(chat, 2)).toBeVisible();
  await chat.panel.getByRole("button", { name: "Убрать изменение: Цель: язык английский" }).click();
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

// Ticket #51: the manual actions on the plan, the archive and the deletion. They work on
// «Kotlin-разработчик», which the first of them creates; the demo Target lends its Questions.

test("a Section switch on the plan writes at once and stays after a reload", async ({ page }) => {
  await newKotlinTarget(page);
  const toggle = sectionBlock(page, "Опыт и резюме").getByRole("switch");
  await expect(toggle).toBeChecked();

  await toggle.click();

  await expect(sectionBlock(page, "Опыт и резюме")).toContainText("выключена");
  await page.reload();
  await expect(sectionBlock(page, "Опыт и резюме").getByRole("switch")).not.toBeChecked();
  await expect(sectionBlock(page, "Go и конкурентность").getByRole("switch")).toBeChecked();
});

test("the side panel hides a Question and returns it", async ({ page }) => {
  const { visible, hidden, count, first } = await demoQuestions(page);

  await visible.first().getByRole("button", { name: "Скрыть" }).click();

  await expect(hidden).toContainText([first]);
  await expect(visible).toHaveCount(count - 1);
  await hidden.first().getByRole("button", { name: "Вернуть" }).click();
  await expect(hidden).toHaveCount(0);
  await expect(visible).toHaveCount(count);
});

test("the side panel rates a Question and clears the rating", async ({ page }) => {
  const { visible } = await demoQuestions(page);
  const useful = visible.first().getByRole("button", { name: "Полезный" });

  await useful.click();

  await expect(useful).toHaveAttribute("aria-pressed", "true");
  await useful.click();
  await expect(useful).toHaveAttribute("aria-pressed", "false");
});

test("«В архив» waits for the agent session to stop, then moves the Target to «Архив»", async ({
  page,
}) => {
  await openTarget(page, kotlinName);
  await expectArchiveUnavailable(page);
  await finishSetup(page);

  await archiveCurrent(page);

  await expect(zones(page).goal).toContainText(demoName);
  await page.getByRole("button", { name: demoName }).click();
  await expect(switcherItem(page, kotlinName)).toHaveCount(0);
  await page.getByRole("menuitem", { name: /Архив/u }).click();
  await expect(archivedTargets(page)).toHaveText([new RegExp(kotlinName, "u")]);
});

test("an archived Target comes back to the Target list with «Вернуть»", async ({ page }) => {
  await page.goto("/archive");

  await archivedTargets(page).getByRole("button", { name: "Вернуть" }).click();

  await expect(archivedTargets(page)).toHaveCount(0);
  await openTarget(page, kotlinName);
  await archiveCurrent(page);
  await expect(zones(page).goal).toContainText(demoName);
});

test("an archived Target goes for good once the Candidate types its name", async ({ page }) => {
  const { name, confirm } = await deletionForm(page, kotlinName);
  await name.fill("Kotlin");
  await expect(confirm).toBeDisabled();
  await name.fill(kotlinName);

  await confirm.click();

  await expect(page.getByText("В архиве нет целей.")).toBeVisible();
  await openSwitcher(page);
  await expect(switcherItem(page, kotlinName)).toHaveCount(0);
});

test("a draft Target is deleted at once after the confirmation", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Новая цель" }).click();
  await onboarding(page);
  await page.getByRole("button", { name: "Меню цели" }).click();
  await page.getByRole("menuitem", { name: "Удалить черновик" }).click();

  await page.getByRole("alertdialog").getByRole("button", { name: "Удалить" }).click();

  await expect(zones(page).goal).toContainText(demoName);
  await openSwitcher(page);
  await expect(switcherItem(page, /Цель без названия/u)).toHaveCount(0);
});

setupChatTests();
inboxTests();
mockInterviewTests();
