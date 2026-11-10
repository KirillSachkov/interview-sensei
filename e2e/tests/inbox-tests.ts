// Spec #47, seam 3: a material attached in the setup chat goes through Inbox processing to the
// Inbox report. canvas.test.ts declares these tests after the setup chat's: the test creates
// «Rust-разработчик» and works only on it.
import { expect, test } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";

import { onboarding, setupChat, zones } from "./canvas-support.ts";
import { openTarget } from "./target-actions.ts";

type SetupChat = ReturnType<typeof setupChat>;

const rustName = "Rust-разработчик";

const vacancy = "Как устроено владение в Rust?\n\nКаждое значение имеет одного владельца.";

/** A new Target «Rust-разработчик» with one Section of Topics, applied by the setup agent. */
async function newRustTarget(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Новая цель" }).click();
  const chat = await onboarding(page);
  await chat.callTool("update_target", { name: rustName, level: "middle" });
  await chat.callTool("set_interview_plan", {
    sections: [{ name: "Rust", kind: "topics", topics: ["Владение"] }],
  });
  await chat.callTool("apply_changes", {});
  await expect(page.getByRole("button", { name: rustName })).toBeVisible();
  return chat;
}

/** Attaches the vacancy with 📎 and sends it with a message, as the Candidate does. */
async function attachVacancy(chat: SetupChat) {
  await chat.panel
    .getByLabel("Прикрепить файлы")
    .setInputFiles([
      { name: "vacancy.md", mimeType: "text/markdown", buffer: Buffer.from(vacancy) },
    ]);
  await chat.panel.getByLabel("Сообщение").fill("Вот вакансия");
  await chat.panel.getByRole("button", { name: "Отправить" }).click();
  await expect(chat.messages.last()).toContainText("Агент: Фейковый агент получил");
  await expect(chat.messages.last()).toContainText("Прикреплённые файлы: «vacancy.md».");
}

/** The id of the Target's only material, as the setup agent learns it from list_sources. */
async function onlySourceId(page: Page): Promise<string> {
  const targetId = new URL(page.url()).pathname.split("/").at(-1) ?? "";
  const response = await page.request.get(`/api/targets/${targetId}/sources`);
  const body: unknown = await response.json();
  const id = /"id":"(?<id>[0-9a-f-]{36})"/u.exec(JSON.stringify(body))?.groups?.id;
  if (typeof id !== "string") {
    throw new TypeError("The Target has no material");
  }
  return id;
}

/** The setup agent proposes the vacancy: the chat shows the card «Разбор материалов». */
async function proposeVacancy(page: Page, chat: SetupChat) {
  await chat.callTool("propose_inbox_processing", {
    sources: [{ id: await onlySourceId(page), assessment: "вакансия — добавит темы" }],
  });
  const card = chat.panel.getByRole("region", { name: "Разбор материалов" });
  await expect(card).toContainText("vacancy.md");
  await expect(card).toContainText("вакансия — добавит темы");
  await expectTitleBesideCheckbox(card, "vacancy.md");
  return card;
}

/** The material's title starts right after its checkbox, not pushed to the card's right edge. */
async function expectTitleBesideCheckbox(card: Locator, title: string) {
  const [checkbox, text] = await Promise.all([
    card.getByRole("checkbox", { name: `Разобрать «${title}»` }).boundingBox(),
    card.getByText(title, { exact: true }).boundingBox(),
  ]);
  if (checkbox === null || text === null) {
    throw new Error("The checkbox or the title has no box on the page");
  }
  expect(text.x - (checkbox.x + checkbox.width)).toBeLessThanOrEqual(16);
}

/** The added Question names its material and part and unfolds its reference answer. */
async function expectReferenceAnswer(added: Locator) {
  await expect(added).toContainText("Из «vacancy.md», часть 1");
  const answer = added.getByRole("group").filter({ hasText: "Опорный ответ" });
  await answer.getByText("Опорный ответ").click();
  await expect(answer).toContainText("из материала, часть 1");
  await expect(answer.getByRole("listitem").first()).toHaveText(
    "Каждое значение имеет одного владельца.",
  );
}

/** Opens the latest Inbox report from «Материалы» and checks what it shows. */
async function expectReport(page: Page, { materials }: { materials: Locator }) {
  // The card may end up under the zoom island: «Показать всё» fits the view to the zone.
  await page.getByRole("button", { name: "Показать всё" }).click();
  await materials.getByRole("button", { name: "Отчёт о разборе" }).click();
  const report = page.getByRole("complementary", { name: "Отчёт о разборе" });
  await expect(report).toContainText("Фейковый разборщик: разобрано материалов: 1.");
  await expect(report.getByRole("heading", { name: "Добавлено вопросов: 1" })).toBeVisible();
  const added = report.getByRole("list", { name: "Добавленные вопросы" });
  await expect(added).toContainText("Как устроено владение в Rust?");
  await expectReferenceAnswer(added);
  await expect(report.getByRole("region", { name: "Предложения агента" })).toContainText(
    "Фейковая секция",
  );
}

/** Opens the latest Inbox report of «Rust-разработчик» from «Материалы». */
async function openRustReport(page: Page) {
  await openTarget(page, rustName);
  await page.getByRole("button", { name: "Показать всё" }).click();
  const materials = zones(page).goal.getByRole("article", { name: "Материалы" });
  await materials.getByRole("button", { name: "Отчёт о разборе" }).click();
  return page.getByRole("complementary", { name: "Отчёт о разборе" });
}

/** The setup agent gives «Владение» a high importance, and the Candidate applies it (#65). */
async function raiseOwnership(page: Page) {
  await openTarget(page, rustName);
  const chat = setupChat(page);
  await expect(chat.panel.getByRole("textbox", { name: "Сообщение" })).toBeVisible();
  await chat.callTool("set_topic_importance", {
    topics: [{ topic: "Владение", importance: "high" }],
  });
  await expect(chat.changes).toContainText(["Важность тем: «Владение» — высокая"]);
  await chat.panel.getByRole("button", { name: "Применить (1)" }).click();
  await page.getByRole("button", { name: "Показать всё" }).click();
}

/** The chip of «Владение» shows ↑; its side panel marks the reference answer «Проверен». */
async function expectVerifiedReference(page: Page) {
  const chip = zones(page).goal.getByRole("button", { name: /^Владение.*высокая важность$/u });
  await expect(chip).toContainText("↑");
  await chip.click();
  const panel = page.getByRole("complementary", { name: "Вопросы: Владение" });
  const question = panel.getByRole("listitem", { name: "Как устроено владение в Rust?" });
  await question.getByText("Опорный ответ").click();
  await expect(question).toContainText("из материала, часть 1");
  await question.getByRole("button", { name: "Проверен" }).click();
  await expect(question.locator("summary")).toHaveText(/^Опорный ответ\s*проверен кандидатом$/u);
  await expect(question.getByRole("button", { name: "Проверен" })).toBeHidden();
}

/** «Выбрать все», then the bulk action «Скрыть»; resolves with the bar of the bulk actions. */
async function hideEvery(report: Locator) {
  await report.getByRole("button", { name: "Выбрать все" }).click();
  const actions = report.getByRole("group", { name: "Действия с выбранными" });
  await expect(actions).toContainText("Выбрано: 1");
  await actions.getByRole("button", { name: "Скрыть" }).click();
  return actions;
}

export function inboxTests() {
  test.describe("Inbox processing of a material from the setup chat", () => {
    test.use({ viewport: { width: 1600, height: 1000 } });

    test("the card starts the processing, «Материалы» shows the statuses, and the report shows the Questions", async ({
      page,
    }) => {
      const chat = await newRustTarget(page);
      await attachVacancy(chat);
      const materials = zones(page).goal.getByRole("article", { name: "Материалы" });
      await expect(materials.getByRole("listitem")).toContainText(["в Inbox"]);
      const card = await proposeVacancy(page, chat);

      await card.getByRole("button", { name: "Запустить разбор" }).click();

      await expect(card).toBeHidden();
      await expect(materials.getByRole("listitem")).toContainText(["готов"]);
      await expect(materials).not.toContainText("Не разобрано");
      await expectReport(page, { materials });
    });

    test("the plan shows a Topic's high importance, and «Проверен» in the side panel marks the reference answer", async ({
      page,
    }) => {
      await raiseOwnership(page);
      await expectVerifiedReference(page);
    });

    test("the report's filter «Только новые» shows the new Questions, and «Скрыть» hides the chosen ones at once", async ({
      page,
    }) => {
      const report = await openRustReport(page);
      const added = report.getByRole("list", { name: "Добавленные вопросы" });
      await report.getByRole("checkbox", { name: "Только новые (1)" }).check();
      await expect(added.getByRole("listitem").last()).toContainText("новый");

      const actions = await hideEvery(report);

      await expect(actions).toBeHidden();
      await expect(added.getByRole("listitem").last()).toContainText("скрыт");
      await report.getByRole("button", { name: "Отметить просмотренными" }).click();
      await expect(report).toContainText("Новых вопросов нет.");
    });
  });
}
