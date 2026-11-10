// Issue #111: «Настройки» reads the models and reasoning levels of an agent without a session.
// The server starts the fake ACP agent for it, sends no prompt and keeps the answer in memory.
import { cp, rm } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it, onTestFinished } from "vitest";

import { largeOptions, optionsServer, smallOptions } from "./agent-options-test-support.ts";
import { fixedTime, temporaryDirectory } from "./chat-test-support.ts";
import { buildServer } from "./server.ts";

const repositorySkills = path.join(import.meta.dirname, "..", "..", "..", "skills");

/** A copy of the application's skills that a test may delete; without them no agent starts. */
async function copiedSkills(): Promise<string> {
  const skillsDirectory = path.join(await temporaryDirectory(), "skills");
  await cp(repositorySkills, skillsDirectory, { recursive: true });
  return skillsDirectory;
}

/**
 * A server that offers Claude Code, Codex and OpenCode from an empty temporary home: Codex has no
 * login there. No agent starts.
 */
async function serverWithRealAgents() {
  const home = await temporaryDirectory();
  const server = await buildServer({
    clock: { now: () => new Date(fixedTime) },
    timer: { repeat: () => () => {}, after: () => () => {} },
    dataDirectory: path.join(home, ".interview-sensei"),
    userEnvironment: { home, env: { PATH: path.join(home, "bin") } },
  });
  onTestFinished(async () => server.close());
  return { server, home };
}

describe("options of an agent without a session", () => {
  it("answers the agent's models with its own default model", async () => {
    const api = await optionsServer();

    const response = await api.get("/api/agents/fake/options");

    expect(response.statusCode).toBe(200);
    expect(response.json()).toStrictEqual(smallOptions);
  });

  it("answers the levels of the asked model", async () => {
    const api = await optionsServer();

    const response = await api.get("/api/agents/fake/options?model=fake-large");

    expect(response.statusCode).toBe(200);
    expect(response.json()).toStrictEqual(largeOptions("low"));
  });

  it("answers the agent's own model for a model it does not offer", async () => {
    const api = await optionsServer();

    const response = await api.get("/api/agents/fake/options?model=fake-retired");

    expect(response.json()).toStrictEqual(smallOptions);
  });

  it("creates no session and ignores the stored default of the agent", async () => {
    const api = await optionsServer();
    await api.storeDefault({ model: "fake-large", effort: "high" });

    const response = await api.get("/api/agents/fake/options");
    const sessions = await api.get("/api/sessions");

    expect(response.json()).toStrictEqual(smallOptions);
    expect(sessions.json()).toStrictEqual([]);
  });

  it("keeps an answer in memory until the page asks to read the agent again", async () => {
    const skillsDirectory = await copiedSkills();
    const api = await optionsServer({ skillsDirectory });
    await api.get("/api/agents/fake/options");
    // Without its skill the agent cannot start, so only a kept answer still comes.
    await rm(skillsDirectory, { recursive: true });

    const kept = await api.get("/api/agents/fake/options");
    const otherModel = await api.get("/api/agents/fake/options?model=fake-large");
    const refreshed = await api.get("/api/agents/fake/options?refresh=1");

    expect(kept.json()).toStrictEqual(smallOptions);
    expect(otherModel.statusCode).toBe(502);
    expect(refreshed.statusCode).toBe(502);
  });

  it("answers 502 with the reason when the agent does not start, and reads it again next time", async () => {
    const skillsDirectory = await copiedSkills();
    const api = await optionsServer({ skillsDirectory });
    await rm(skillsDirectory, { recursive: true });

    const failed = await api.get("/api/agents/fake/options");
    await cp(repositorySkills, skillsDirectory, { recursive: true });
    const read = await api.get("/api/agents/fake/options");

    expect(failed.statusCode).toBe(502);
    expect(failed.json()).toMatchObject({ error: "probe_failed" });
    expect(failed.json<{ message: string }>().message).not.toBe("");
    expect(read.json()).toStrictEqual(smallOptions);
  });

  it("answers 404 for an agent the server does not offer", async () => {
    const api = await optionsServer();

    const response = await api.get("/api/agents/codex/options");

    expect(response.statusCode).toBe(404);
    expect(response.json()).toStrictEqual({ error: "agent_not_found" });
  });

  it("answers 409 with the reason for an agent that cannot run now", async () => {
    const { server, home } = await serverWithRealAgents();

    const response = await server.inject({ url: "/api/agents/codex/options" });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toStrictEqual({
      error: "agent_unavailable",
      reason: `Нет входа в Codex: не найден ${path.join(home, ".codex", "auth.json")}. Выполните \`codex login\` и обновите страницу.`,
    });
  });
});
