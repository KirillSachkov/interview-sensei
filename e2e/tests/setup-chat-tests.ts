// The setup chat tests of the live check of spec #45 (D1, D2) and of issue #71 with their helpers. canvas.test.ts
// declares them after its own tests: «Новая цель» creates «Python-разработчик», and the next
// tests work on it in the same serial order.
import { expect, test } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";

import { onboarding, setupChat, zones } from "./canvas-support.ts";
import { openTarget } from "./target-actions.ts";

const pythonName = "Python-разработчик";

const pythonPlan = {
  sections: [
    { name: "Опыт и резюме", kind: "conversation", topics: [] },
    { name: "Python", kind: "topics", topics: ["Генераторы", "GIL"] },
  ],
};

/** As many Questions as a real agent records at once in the onboarding (56 in the live check). */
const manyQuestions = Array.from({ length: 56 }, (_item, index) => ({
  topic: index % 2 === 0 ? "Генераторы" : "GIL",
  text: `Вопрос ${index + 1}: расскажите, как вы применяли генераторы и что мешало в проекте?`,
}));

/** The element is on the screen and inside the setup chat's panel, not pushed out of it. */
async function expectInPanel(panel: Locator, element: Locator) {
  await expect(element).toBeInViewport();
  const [outer, inner] = await Promise.all([panel.boundingBox(), element.boundingBox()]);
  expect(inner?.y ?? 0).toBeGreaterThanOrEqual(outer?.y ?? 0);
  expect((inner?.y ?? 0) + (inner?.height ?? 0)).toBeLessThanOrEqual(
    (outer?.y ?? 0) + (outer?.height ?? 0),
  );
}

/** Sends a short message and waits for the fake agent's echo. */
async function sendMessage(chat: ReturnType<typeof setupChat>, text: string) {
  await chat.panel.getByLabel("Сообщение").fill(text);
  await chat.panel.getByRole("button", { name: "Отправить" }).click();
  await expect(chat.messages.last()).toContainText(`Фейковый агент получил: «${text}»`);
}

/** Sends `/markdown` and waits for the fake agent's tall reply. */
async function sendMarkdown(chat: ReturnType<typeof setupChat>) {
  const count = await chat.messages.count();
  await chat.panel.getByLabel("Сообщение").fill("/markdown");
  await chat.panel.getByRole("button", { name: "Отправить" }).click();
  await expect(chat.messages).toHaveCount(count + 2);
  await expect(chat.messages.last()).toContainText("Опасная ссылка");
}

/** The scroll position of an element; the tests compile without the DOM types. */
interface Scrolled {
  scrollTop: number;
  readonly scrollHeight: number;
  readonly clientHeight: number;
}

/** How far the scrolled list is from its bottom, in pixels; it must overflow to scroll at all. */
async function scrollGap(list: Locator): Promise<number> {
  const { scrollHeight, scrollTop, clientHeight } = await list.evaluate(
    ({ scrollHeight: height, scrollTop: top, clientHeight: client }: Scrolled) => ({
      scrollHeight: height,
      scrollTop: top,
      clientHeight: client,
    }),
  );
  expect(scrollHeight).toBeGreaterThan(clientHeight);
  return scrollHeight - scrollTop - clientHeight;
}

/** Scrolls the list to its top, as the Candidate does to reread the chat. */
async function scrollToTop(list: Locator) {
  await list.evaluate((element: Scrolled) => {
    element.scrollTop = 0;
  });
}

/** «Python-разработчик» with its running setup chat open and its history loaded. */
async function openPythonChat(page: Page) {
  await openTarget(page, pythonName);
  await zones(page).goal.getByRole("button", { name: "Настроить цель" }).click();
  const chat = setupChat(page);
  // The message box appears with the chat's history, which callTool counts.
  await expect(chat.panel.getByRole("textbox", { name: "Сообщение" })).toBeVisible();
  return chat;
}

/** The draft's words and the chat's scroll while the draft comes and goes, on «Python-разработчик». */
function draftChatTests() {
  test("the draft names the language and the Preference in the screen's Russian words", async ({
    page,
  }) => {
    const chat = await openPythonChat(page);

    await chat.callTool("update_target", { language: "ru" });
    await chat.callTool("save_preference", { text: "Меньше определений" });

    await expect(chat.changes).toHaveText([
      /^Цель: язык русский/u,
      /^Пожелание: «Меньше определений»/u,
    ]);
    await chat.panel.getByRole("button", { name: "Отменить изменения" }).click();
    await expect(chat.changes).toHaveCount(0);
  });

  test("the chat stays at its last message when the draft appears, and stays put when scrolled up", async ({
    page,
  }) => {
    const chat = await openPythonChat(page);
    const list = chat.panel.getByRole("list", { name: "Сообщения" });
    // A tall reply, so the messages overflow the list before the draft takes its room.
    await sendMarkdown(chat);

    await chat.callTool("update_target", { tone: "strict" });

    await expect(chat.changes).toHaveCount(1);
    await expect(async () => {
      expect(await scrollGap(list)).toBeLessThanOrEqual(1);
    }).toPass({ timeout: 5000 });
    await scrollToTop(list);
    await chat.panel.getByRole("button", { name: "Отменить изменения" }).click();
    await expect(chat.changes).toHaveCount(0);
    expect(await list.evaluate(({ scrollTop }: Scrolled) => scrollTop)).toBe(0);
  });
}

/**
 * Holds the answers of the draft until the returned release: the draft then arrives with no new
 * message after it, as when the agent's turn has ended. Its other requests pass.
 */
async function holdDraft(page: Page) {
  const held = Promise.withResolvers<null>();
  const draft = /\/api\/targets\/[^/]+\/draft$/u;
  await page.route(draft, async (route) => {
    if (route.request().method() === "GET") {
      await held.promise;
    }
    await route.continue();
  });
  return () => {
    held.resolve(null);
  };
}

/** «Отменить изменения» empties the draft, so the next tests start without one. */
async function discardDraft(chat: ReturnType<typeof setupChat>) {
  await chat.panel.getByRole("button", { name: "Отменить изменения" }).click();
  await expect(chat.changes).toHaveCount(0);
}

/** The draft that arrives after the Candidate scrolled up leaves the chat where it is. */
function scrolledDraftTest() {
  test("the chat stays where the Candidate scrolled when the draft appears after the turn", async ({
    page,
  }) => {
    const chat = await openPythonChat(page);
    const list = chat.panel.getByRole("list", { name: "Сообщения" });
    await sendMarkdown(chat);
    const release = await holdDraft(page);

    await chat.callTool("update_target", { tone: "strict" });
    await scrollToTop(list);
    release();

    await expect(chat.changes).toHaveCount(1);
    await expect(list.evaluate(({ scrollTop }: Scrolled) => scrollTop)).resolves.toBe(0);
    await discardDraft(chat);
  });
}

/** A plan as long as a real agent's: five Sections with their Topics. */
const longPlan = {
  sections: ["Опыт", "Kotlin", "Корутины", "Android", "Проектирование"].map((name, index) => ({
    name,
    kind: index === 0 ? "conversation" : "topics",
    topics: Array.from({ length: 5 }, (_topic, topic) => `${name}: тема ${topic + 1}`),
  })),
};

// Issue #88: a long plan that appeared after the canvas opened went under the zoom island. Since
// #113 the view stays where the Candidate left it when the plan appears (the owner's remark in
// #109), and «Показать всё» fits the long plan above the zoom island.
function longPlanTest() {
  test("«Показать всё» puts a new Target's long plan above the zoom island", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Новая цель" }).click();
    const chat = await onboarding(page);
    await chat.callTool("update_target", { name: "Kotlin-разработчик", level: "senior" });
    await chat.callTool("set_interview_plan", longPlan);

    await chat.callTool("apply_changes", {});

    const plan = zones(page).goal.getByRole("list", { name: "План собеседования" });
    const zoom = page.getByLabel("Масштаб", { exact: true });
    await expect(plan.getByRole("list", { name: "Темы" })).toHaveCount(5);
    await page.getByRole("button", { name: "Показать всё" }).click();
    await expect(async () => {
      const [planBox, zoomBox] = await Promise.all([box(plan), box(zoom)]);
      expect(planBox.y + planBox.height).toBeLessThanOrEqual(zoomBox.y);
    }).toPass({ timeout: 5000 });
  });
}

/** The element's box on the page; an element off the page fails the test. */
async function box(element: Locator) {
  const found = await element.boundingBox();
  if (found === null) {
    throw new Error("The element has no box on the page");
  }
  return found;
}

// Issue #71: the open setup chat used to cover the left part of the «Сессии» zone. Since #113 the
// zone appears with the Target's first Mock interview, started from the «Цель» zone.
function sessionsZoneTest() {
  test("«Начать мок-собеседование» opens the start window, and «Сессии» stays off the canvas", async ({
    page,
  }) => {
    const chat = await openPythonChat(page);
    const { goal, sessions } = zones(page);
    await expect(sessions).toHaveCount(0);

    await goal.getByRole("button", { name: "Начать мок-собеседование" }).click();

    await expect(page.getByRole("dialog", { name: "Начать мок" })).toBeVisible();
    await expect(chat.panel).toBeVisible();
    await expect(sessions).toHaveCount(0);
    await page
      .getByRole("dialog", { name: "Начать мок" })
      .getByRole("button", { name: "Отмена" })
      .click();
  });
}

/** A long draft leaves the chat's last message, input and «Применить» on the screen. */
function longDraftTest() {
  test("a long draft keeps the chat's last message, input and «Применить» in the panel", async ({
    page,
  }) => {
    const chat = await openPythonChat(page);
    await chat.callTool("add_questions", { questions: manyQuestions });

    await sendMessage(chat, "Что дальше?");

    await expect(chat.changes).toHaveText([/^Вопросы: добавить 56 вопросов/u]);
    for (const element of [
      chat.messages.last(),
      chat.panel.getByRole("textbox", { name: "Сообщение" }),
      chat.panel.getByRole("button", { name: "Применить (1)" }),
    ]) {
      // oxlint-disable-next-line eslint/no-await-in-loop -- one element after another on one page
      await expectInPanel(chat.panel, element);
    }
    await chat.panel.getByRole("button", { name: "Отменить изменения" }).click();
    await expect(chat.changes).toHaveCount(0);
  });
}

export function setupChatTests() {
  test.describe("the setup chat beside a large screen's canvas", () => {
    // The live check ran on a 1600×1000 window, where the whole chat panel is on the screen.
    test.use({ viewport: { width: 1600, height: 1000 } });

    test("the agent's apply_changes puts the plan on the canvas without a reload", async ({
      page,
    }) => {
      await page.goto("/");
      await page.getByRole("button", { name: "Новая цель" }).click();
      const chat = await onboarding(page);
      await chat.callTool("update_target", { name: pythonName, level: "middle" });
      await chat.callTool("set_interview_plan", pythonPlan);

      await chat.callTool("apply_changes", {});

      const plan = zones(page).goal.getByRole("list", { name: "План собеседования" });
      await expect(plan.getByRole("list", { name: "Темы" })).toHaveText(
        "Генераторы: не начатоGIL: не начато",
      );
      await expect(zones(page).goal).toContainText("Уровень: Middle");
      await expect(page.getByRole("button", { name: pythonName })).not.toContainText("черновик");
    });

    longDraftTest();
    draftChatTests();
    scrolledDraftTest();
    longPlanTest();
  });
  sessionsZoneTest();
}
