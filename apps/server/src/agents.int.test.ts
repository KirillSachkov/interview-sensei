// The agents the server offers the Candidate. A temporary directory stands for the Candidate's
// home, with an empty PATH, so the test never reads the real home and starts no real agent.
import path from "node:path";

import { describe, expect, it, onTestFinished } from "vitest";

import { fixedTime, temporaryDirectory } from "./chat-test-support.ts";
import { buildServer } from "./server.ts";

async function serverWithHome(home: string, fakeAgent = false) {
  const server = await buildServer({
    clock: { now: () => new Date(fixedTime) },
    timer: { repeat: () => () => {}, after: () => () => {} },
    dataDirectory: path.join(home, ".interview-sensei"),
    fakeAgent,
    userEnvironment: { home, env: { PATH: path.join(home, "bin") } },
  });
  onTestFinished(async () => server.close());
  return server;
}

describe("agents API", () => {
  it("lists Claude Code, Codex and OpenCode with the reason each unavailable one has", async () => {
    const home = await temporaryDirectory();
    const server = await serverWithHome(home);

    const response = await server.inject({ method: "GET", url: "/api/agents" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toStrictEqual([
      { agent: "claude", available: true },
      {
        agent: "codex",
        available: false,
        reason: `Нет входа в Codex: не найден ${path.join(home, ".codex", "auth.json")}. Выполните \`codex login\` и обновите страницу.`,
      },
      {
        agent: "opencode",
        available: false,
        reason:
          "OpenCode не установлен: команда `opencode` не найдена в PATH. Установите OpenCode и перезапустите приложение.",
      },
    ]);
  });

  it("refuses to start a chat with an unavailable agent", async () => {
    const server = await serverWithHome(await temporaryDirectory());

    const response = await server.inject({
      method: "POST",
      url: "/api/sessions",
      payload: { kind: "service-chat", agent: "codex" },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toStrictEqual({ error: "agent_unavailable" });
  });

  it("offers only the fake agent when the server runs with it", async () => {
    const server = await serverWithHome(await temporaryDirectory(), true);

    const response = await server.inject({ method: "GET", url: "/api/agents" });

    expect(response.json()).toStrictEqual([{ agent: "fake", available: true }]);
  });
});
