// Spec #42, seam 3: the canvas frame. The tests share the server's data directory and run in
// order: the first one sees no Targets and opens the demo Target, the rest work on it. No other
// test file creates Targets.
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

// Spec #41: the fake agent's interviewer mode takes the Grade from the marker in the answer and
// sends a hint right after it shows a question, which the chat must leave out.

/** Starts a mock on «Опыт и резюме» only, from the dialog «Начать мок». */
async function startMock(sessions: Locator) {
  await sessions.getByRole("button", { name: "Начать мок" }).click();
  const dialog = sessions.getByRole("dialog", { name: "Начать мок" });
  await dialog.getByRole("checkbox", { name: "TypeScript и Node.js" }).uncheck();
  await dialog.getByRole("checkbox", { name: "Проектирование" }).uncheck();
  await dialog.getByRole("button", { name: "Начать" }).click();
}

/** Answers the card's question; Enter sends the answer. */
async function answer(card: Locator, text: string) {
  const field = card.getByRole("textbox", { name: "Ваш ответ" });
  await field.fill(text);
  await field.press("Enter");
  await expect(card).toContainText(`Ваш ответ: ${text}`);
}

/** Opens the card's Debrief and checks its Grade. */
async function openDebrief(card: Locator, grade: string) {
  await card.getByRole("button", { name: "Посмотреть разбор" }).click();
  await expect(card.getByRole("region", { name: "Разбор" })).toContainText(`Оценка: ${grade}`);
}

/** Presses «Завершить» and waits for the interviewer's summary. */
async function finishMock(sessions: Locator) {
  await sessions.getByRole("button", { name: "Завершить" }).click();
  const result = sessions.getByRole("region", { name: "Итог мока" });
  await expect(result.getByRole("heading", { name: "Мок завершён" })).toBeVisible();
  await expect(result).toContainText("Фейковый интервьюер: мок завершён.");
}

/** The chat shows the reply to the answer, never the hint, and tells that replies are hidden. */
async function expectInterviewerChat(sessions: Locator) {
  const interviewer = sessions.getByRole("complementary", { name: "Интервьюер" });
  await expect(interviewer).toContainText("Ответ получен.");
  await expect(interviewer).not.toContainText("Подсказка до ответа");
  await expect(interviewer).toContainText("Ответы интервьюера скрыты");
}

/**
 * `[followup]`: the interviewer asks a Follow-up and records no Attempt before the finish, so the
 * ended mock shows the answered question without a Grade.
 */
async function finishWithoutGrade(sessions: Locator) {
  const second = sessions.getByRole("article", { name: "Вопрос 2" });
  await answer(second, "Не уверен. [followup]");
  await expect(second).toContainText("Фейковый Follow-up");
  await finishMock(sessions);
  await expect(second).toContainText("Без оценки");
}

test("the Candidate starts a mock, answers, opens the Debrief and finishes the mock", async ({
  page,
}) => {
  await page.goto("/");
  const { sessions } = zones(page);
  await startMock(sessions);

  const first = sessions.getByRole("article", { name: "Вопрос 1" });
  await answer(first, "Я вёл сервис платежей. [grade:3]");
  await openDebrief(first, "3 из 3");
  await expectInterviewerChat(sessions);
  await finishWithoutGrade(sessions);
});

// Spec #41, ticket #54: a Dispute corrects the Grade at once, and the summary Debrief shows how the
// Topic status changed.

/** Starts a mock on the one Section, from the dialog «Начать мок». */
async function startMockOn(sessions: Locator, section: string) {
  await sessions.getByRole("button", { name: "Начать мок" }).click();
  const dialog = sessions.getByRole("dialog", { name: "Начать мок" });
  for (const other of ["Опыт и резюме", "TypeScript и Node.js", "Проектирование"]) {
    if (other !== section) {
      // oxlint-disable-next-line eslint/no-await-in-loop -- the checkboxes change one after another
      await dialog.getByRole("checkbox", { name: other }).uncheck();
    }
  }
  await dialog.getByRole("button", { name: "Начать" }).click();
}

/** Disputes the Grade in the card's open Debrief: a new Grade and the reason. */
async function disputeGrade(card: Locator, grade: string, reason: string) {
  const debrief = card.getByRole("region", { name: "Разбор" });
  await debrief.getByRole("button", { name: "Оспорить оценку" }).click();
  const form = debrief.getByRole("form", { name: "Оспорить оценку" });
  await form.getByRole("radio", { name: grade, exact: true }).check();
  await form.getByLabel("Причина").fill(reason);
  await form.getByRole("button", { name: "Сохранить" }).click();
}

/** The Debrief shows the corrected Grade «~~1~~ → 3» with the reason. */
async function expectCorrected(card: Locator, reason: string) {
  const debrief = card.getByRole("region", { name: "Разбор" });
  await expect(debrief).toContainText("Оценка: 1 → 3 из 3");
  await expect(debrief).toContainText(`Причина исправления: ${reason}`);
}

/** Finishes the mock; the summary Debrief shows the Topic status change and the unanswered question. */
async function finishWithSummaryDebrief(sessions: Locator) {
  await finishMock(sessions);
  const summary = sessions.getByRole("region", { name: "Итоговый разбор" });
  await expect(summary.getByRole("list", { name: "Изменения тем" })).toContainText(
    "Проектирование сервисов: не начато → шатко",
  );
  await expect(summary).toContainText("Без ответа: 1");
}

/** «Готовность» counts no confident Topic and puts the shaky Topic among those to work on. */
async function expectReadiness(goal: Locator) {
  const readiness = goal.getByRole("region", { name: "Готовность" });
  await expect(readiness).toContainText("0 из 5 тем уверенно");
  await expect(readiness.getByRole("list", { name: "Подтянуть в первую очередь" })).toContainText(
    "Проектирование сервисов",
  );
}

const disputeReason = "Я назвал сбои и наблюдаемость.";

test("the Candidate disputes a Grade and sees the summary Debrief with the Topic status changes", async ({
  page,
}) => {
  await page.goto("/");
  const { goal, sessions } = zones(page);
  const first = sessions.getByRole("article", { name: "Вопрос 1" });
  await startMockOn(sessions, "Проектирование");
  await answer(first, "Очередь, ретраи и идемпотентные обработчики. [grade:1]");
  await openDebrief(first, "1 из 3");

  await disputeGrade(first, "3", disputeReason);

  await expectCorrected(first, disputeReason);
  await finishWithSummaryDebrief(sessions);
  await expectReadiness(goal);
});
