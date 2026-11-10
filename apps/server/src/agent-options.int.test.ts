// Issue #111: the Candidate chooses the model and the reasoning level of an agent, in a session's
// chat and as a default in «Настройки». The fake ACP agent stands for the agent: it offers two
// models, levels only for `fake-large`, and tells with `/options` what it runs with.
import { describe, expect, it } from "vitest";

import { largeOptions, optionsServer, smallOptions } from "./agent-options-test-support.ts";
import type { SessionView } from "./chat-test-support.ts";

const unknownSession = "00000000-0000-4000-8000-000000000000";

describe("model and reasoning level of a session", () => {
  it("shows the agent's model, and no level for a model without levels", async () => {
    const api = await optionsServer();

    const chat = await api.chat();

    await expect(chat.offered()).resolves.toStrictEqual(smallOptions);
    await expect(chat.agentSays()).resolves.toBe("Модель: fake-small, уровень: нет");
  });

  it("sets the model, then the level that only the new model offers, in one request", async () => {
    const api = await optionsServer();
    const chat = await api.chat();

    const response = await chat.set({ model: "fake-large", effort: "high" });

    expect(response.statusCode).toBe(200);
    expect(response.json<SessionView>().options).toStrictEqual(largeOptions("high"));
    expect(response.json<SessionView>().id).toBe(chat.sessionId);
    await expect(chat.agentSays()).resolves.toBe("Модель: fake-large, уровень: high");
  });

  it("tells the page over the session's socket what the agent offers after a change", async () => {
    const api = await optionsServer();
    const chat = await api.chat();

    await chat.set({ model: "fake-large" });

    const view = await chat.events.waitFor((seen) => seen.options?.effort !== null);
    expect(view.options).toStrictEqual(largeOptions("low"));
  });

  it("drops the level when the Candidate returns to a model without levels", async () => {
    const api = await optionsServer();
    const chat = await api.chat();
    await chat.set({ model: "fake-large" });
    await chat.set({ effort: "high" });

    const response = await chat.set({ model: "fake-small" });

    expect(response.json<SessionView>().options).toStrictEqual(smallOptions);
    await expect(chat.agentSays()).resolves.toBe("Модель: fake-small, уровень: нет");
  });

  it.each([
    ["a model the agent does not offer", { model: "fake-huge" }],
    ["a level while the model has none", { effort: "high" }],
  ])("refuses %s with 400 and changes nothing", async (_case, change) => {
    const api = await optionsServer();
    const chat = await api.chat();

    const response = await chat.set(change);

    expect(response.statusCode).toBe(400);
    expect(response.json()).toStrictEqual({ error: "unknown_option" });
    await expect(chat.agentSays()).resolves.toBe("Модель: fake-small, уровень: нет");
  });

  it("refuses a level the new model does not offer and keeps the model it just set", async () => {
    const api = await optionsServer();
    const chat = await api.chat();

    const response = await chat.set({ model: "fake-large", effort: "extreme" });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toStrictEqual({ error: "unknown_option" });
    await expect(chat.offered()).resolves.toStrictEqual(largeOptions("low"));
  });

  it.each([
    ["an empty body", {}],
    ["a number", { model: 3 }],
    ["an extra field", { model: "fake-large", mode: "default" }],
  ])("refuses %s with 400", async (_case, change) => {
    const api = await optionsServer();
    const chat = await api.chat();

    const response = await chat.set(change);

    expect(response.statusCode).toBe(400);
    expect(response.json()).toStrictEqual({ error: "invalid_request" });
  });

  it("answers 404 for a session it does not know", async () => {
    const api = await optionsServer();

    const response = await api.put(`/api/sessions/${unknownSession}/options`, {
      model: "fake-large",
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toStrictEqual({ error: "session_not_found" });
  });

  it("refuses a change with 409 while the agent works, and takes it once the turn ends", async () => {
    const api = await optionsServer();
    const chat = await api.chat();
    await chat.startTurn();

    const busy = await chat.set({ model: "fake-large" });
    await chat.stopTurn();
    const idle = await chat.set({ model: "fake-large" });

    expect(busy.statusCode).toBe(409);
    expect(busy.json()).toStrictEqual({ error: "session_busy" });
    expect(idle.statusCode).toBe(200);
  });
});

describe("default model and reasoning level of an agent", () => {
  it("has no stored choice until the Candidate makes one", async () => {
    const api = await optionsServer();

    const settings = await api.get("/api/settings");

    expect(settings.json()).toStrictEqual({
      defaultAgent: null,
      fillInBackground: false,
      agentModels: {},
    });
  });

  it("starts the next session with the stored model and level", async () => {
    const api = await optionsServer();

    const stored = await api.storeDefault({ model: "fake-large", effort: "high" });
    const chat = await api.chat();

    expect(stored.statusCode).toBe(200);
    expect(stored.json()).toStrictEqual({
      defaultAgent: null,
      fillInBackground: false,
      agentModels: { fake: { model: "fake-large", effort: "high" } },
    });
    await expect(chat.offered()).resolves.toStrictEqual(largeOptions("high"));
    await expect(chat.agentSays()).resolves.toBe("Модель: fake-large, уровень: high");
  });

  it("starts a session of a Target, such as its setup, with the stored model and level", async () => {
    const api = await optionsServer();
    await api.storeDefault({ model: "fake-large", effort: "high" });

    const setup = await api.setup();

    await expect(setup.agentSays()).resolves.toBe("Модель: fake-large, уровень: high");
    await expect(setup.offered()).resolves.toStrictEqual(largeOptions("high"));
  });

  it("leaves a session that already runs as it is", async () => {
    const api = await optionsServer();
    const chat = await api.chat();

    await api.storeDefault({ model: "fake-large", effort: "high" });

    await expect(chat.agentSays()).resolves.toBe("Модель: fake-small, уровень: нет");
  });

  it.each([
    [
      "a model the agent no longer offers, with a level its own model lacks",
      { model: "fake-retired", effort: "high" },
      "Модель: fake-small, уровень: нет",
    ],
    [
      "a level the stored model no longer offers",
      { model: "fake-large", effort: "extreme" },
      "Модель: fake-large, уровень: low",
    ],
    ["only a model", { model: "fake-large", effort: null }, "Модель: fake-large, уровень: low"],
  ])("starts a session with %s and skips what is not offered", async (_case, choice, runsWith) => {
    const api = await optionsServer();
    await api.storeDefault(choice);

    const chat = await api.chat();

    await expect(chat.events.waitFor((view) => view.status === "idle")).resolves.toMatchObject({
      failure: null,
    });
    await expect(chat.agentSays()).resolves.toBe(runsWith);
  });

  it("returns to the agent's own model once the stored choice is cleared", async () => {
    const api = await optionsServer();
    await api.storeDefault({ model: "fake-large", effort: "high" });

    const cleared = await api.storeDefault({ model: null, effort: null });
    const chat = await api.chat();

    expect(cleared.json<{ agentModels: object }>().agentModels).toStrictEqual({
      fake: { model: null, effort: null },
    });
    await expect(chat.agentSays()).resolves.toBe("Модель: fake-small, уровень: нет");
  });

  it("refuses an agent the server does not offer with 400", async () => {
    const api = await optionsServer();

    const response = await api.storeDefault({ model: "gpt", effort: null }, "codex");

    expect(response.statusCode).toBe(400);
    expect(response.json()).toStrictEqual({ error: "unknown_agent" });
  });

  it.each([
    ["a missing level", { model: "fake-large" }],
    ["a number", { model: 3, effort: null }],
    ["an extra field", { model: "fake-large", effort: null, agent: "fake" }],
  ])("refuses %s with 400", async (_case, choice) => {
    const api = await optionsServer();

    const response = await api.storeDefault(choice);

    expect(response.statusCode).toBe(400);
    expect(response.json()).toStrictEqual({ error: "invalid_request" });
  });
});
