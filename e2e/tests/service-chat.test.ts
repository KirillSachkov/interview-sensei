// The ticket's acceptance criterion: «Привет» in the service chat gets the fake agent's reply.
import { expect, test } from "@playwright/test";
import type { Locator, Page, Request } from "@playwright/test";

/** Opens the page, starts a chat with the fake agent and returns its message list items. */
async function startNewChat(page: Page) {
  await page.goto("/agent-check");
  await page
    .getByRole("combobox", { name: "Агент", exact: true })
    .selectOption({ label: "Фейковый агент" });
  await page.getByRole("button", { name: "Новый чат" }).click();
  // The new chat replaces the latest one of other tests and has no messages yet.
  const messages = page.getByRole("list", { name: "Сообщения" }).getByRole("listitem");
  await expect(messages).toHaveCount(0);
  return messages;
}

/** The field turns on when the agent has started; chats of earlier runs keep it off. */
async function sendMessage(page: Page, text: string) {
  await page.getByLabel("Сообщение").fill(text);
  await page.getByRole("button", { name: "Отправить" }).click();
}

test("the fake agent answers «Привет» in a new service chat", async ({ page }) => {
  const messages = await startNewChat(page);

  await sendMessage(page, "Привет");

  await expect(messages).toHaveText(["Вы: Привет", "Агент: Фейковый агент получил: «Привет»"]);
});

test("the chat shows the agent's error answer and takes the next message", async ({ page }) => {
  const messages = await startNewChat(page);

  await sendMessage(page, "/fail");

  await expect(messages.getByRole("alert")).toHaveText(
    "Агент не смог ответить: Фейковый агент не смог ответить. Отправьте сообщение ещё раз.",
  );
  await sendMessage(page, "Привет");
  await expect(messages.last()).toHaveText("Агент: Фейковый агент получил: «Привет»");
});

/**
 * The fake agent names its options in English, as real agents do: the buttons take Russian names
 * by the option's kind, and the agent's own name stays as the tooltip. Two options of one kind add
 * the agent's name, so their buttons differ.
 */
async function expectOptionsByKind(request: Locator) {
  const buttons = request.getByRole("button");
  await expect(buttons).toHaveText([
    "Разрешить один раз",
    "Разрешать всегда — Always allow",
    "Разрешать всегда — Always allow this command",
    "Запретить",
    "Запрещать всегда",
  ]);
  await expect(buttons.first()).toHaveAttribute("title", "Allow once");
  return buttons;
}

test("the Candidate answers the agent's permission request in the chat", async ({ page }) => {
  const messages = await startNewChat(page);

  await sendMessage(page, "/permission");

  const request = messages.getByRole("group", { name: "Запрос разрешения" });
  await expect(request).toContainText(
    /Агент просит разрешение: mcp__interview-sensei-[0-9a-f]{8}__get_brief: touch interview-sensei\/get_brief\.txt/u,
  );
  // The title may mislead, so the agent's command shows beside it.
  await expect(request).toContainText(
    "Команда или аргументы агента: touch interview-sensei/get_brief.txt",
  );
  const buttons = await expectOptionsByKind(request);
  await buttons.first().click();
  await expect(request).toContainText("Ваш ответ: Разрешить один раз");
  await expect(buttons).toHaveCount(0);
  await expect(messages.last()).toHaveText("Агент: Фейковый агент получил ответ: «Allow once»");
});

/** The bold text, list, code block, table and safe link of the fake agent's `/markdown`. */
async function expectFormatted(reply: Locator) {
  await expect(reply.getByRole("strong")).toHaveText(["Агент:", "Жирный"]);
  await expect(reply.getByRole("list").getByRole("listitem")).toHaveText([
    "первый пункт",
    "второй пункт",
  ]);
  await expect(reply.locator("pre code")).toHaveText("const answer = 42;");
  await expect(reply.getByRole("cell")).toHaveText(["Горутины", "шатко"]);
  const link = reply.getByRole("link", { name: "Документация" });
  await expect(link).toHaveAttribute("target", "_blank");
  await expect(link).toHaveAttribute("rel", "noopener noreferrer");
}

test("the chat shows the agent's Markdown formatted and raw HTML as text", async ({ page }) => {
  await startNewChat(page);

  // The fake agent's `/markdown` replies with Markdown and raw HTML.
  await sendMessage(page, "/markdown");

  // The reply's own list items are nested inside the chat's message item.
  const reply = page.getByRole("list", { name: "Сообщения" }).locator(":scope > li").last();
  await expectFormatted(reply);
  await expect(reply).toContainText("<b>сырой HTML</b>");
  await expect(reply.locator("b")).toHaveCount(0);
});

/** The addresses of the images the page requests from now on. */
function requestedImages(page: Page): string[] {
  const images: string[] = [];
  page.on("request", (request) => {
    if (request.resourceType() === "image") {
      images.push(request.url());
    }
  });
  return images;
}

test("the chat drops the agent's javascript: link and loads no remote image", async ({ page }) => {
  const images = requestedImages(page);
  await startNewChat(page);

  await sendMessage(page, "/markdown");

  const reply = page.getByRole("list", { name: "Сообщения" }).locator(":scope > li").last();
  await expect(reply).toContainText("Опасная ссылка");
  await expect(reply.locator('[href^="javascript"]')).toHaveCount(0);
  await expect(reply.locator("img")).toHaveCount(0);
  await expect(reply.getByRole("link", { name: "Изображение: Схема" })).toHaveAttribute(
    "href",
    "https://example.com/tracker.png",
  );
  expect(images).not.toContain("https://example.com/tracker.png");
});

test("the chat shows that the agent works until the Candidate stops the turn", async ({ page }) => {
  await startNewChat(page);

  // The fake agent's `/wait` keeps the turn running until a cancel.
  await sendMessage(page, "/wait");

  const working = page.getByText("Агент работает…");
  await expect(working).toBeVisible();
  await page.getByRole("button", { name: "Остановить" }).click();
  await expect(working).toBeHidden();
});

const isPost = (request: Request) => request.method() === "POST";

/**
 * Opens the page as if Claude Code were available and no Claude Code chat existed. Tests never run
 * Claude Code; a new chat gets 400. Resolves the started request's body when the page sends one.
 */
async function openWithClaude(page: Page) {
  await page.route("/api/agents", async (route) =>
    route.fulfill({ json: [{ agent: "claude", available: true }] }),
  );
  await page.route("/api/sessions", async (route) =>
    isPost(route.request())
      ? route.fulfill({ status: 400, json: { error: "agent_unavailable" } })
      : route.fulfill({ json: [] }),
  );
  const started = page.waitForRequest(
    (request) => isPost(request) && request.url().endsWith("/api/sessions"),
  );
  await page.goto("/agent-check");
  return async (): Promise<unknown> => {
    const request = await started;
    return request.postDataJSON();
  };
}

test("the Agent SDK credit warning blocks the first Claude Code chat until confirmed", async ({
  page,
}) => {
  const startedChat = await openWithClaude(page);

  const newChat = page.getByRole("button", { name: "Новый чат" });
  const warning = page.getByRole("note", { name: "Предупреждение о кредитах Agent SDK" });
  await expect(warning).toContainText("списывается из отдельных кредитов Agent SDK");
  await expect(newChat).toBeDisabled();
  await warning.getByLabel("Понятно, использовать кредиты Agent SDK").check();
  await newChat.click();

  await expect(startedChat()).resolves.toStrictEqual({ kind: "service-chat", agent: "claude" });
});
