// Seam 2 of #17: which agents the Candidate can choose and why the others are unavailable.
// The facts about the machine are made up; the detector that gathers them has its own test.
import { describe, expect, it } from "vitest";

import { agentAvailability } from "./domain/agent.ts";
import type { AgentHost } from "./domain/agent.ts";

const host: AgentHost = {
  nodeExecutable: "/usr/local/bin/node",
  fakeAgentScript: "/app/fake-agent.ts",
  claudeAdapter: "/app/node_modules/claude-agent-acp/dist/index.js",
  codexAdapter: "/app/node_modules/codex-acp/dist/index.js",
  opencodeBinary: "/opt/homebrew/bin/opencode",
  codexAuth: { path: "/home/candidate/.codex/auth.json", exists: true },
  opencodeAuth: { path: "/home/candidate/.local/share/opencode/auth.json", exists: false },
  opencodeModel: {},
};

function availability(changes: Partial<AgentHost> = {}) {
  const [claude, codex, opencode] = agentAvailability(["claude", "codex", "opencode"], {
    ...host,
    ...changes,
  });
  return { claude, codex, opencode };
}

describe("agent availability", () => {
  it("offers every agent that is installed and logged in", () => {
    expect(availability()).toStrictEqual({
      claude: { agent: "claude", available: true },
      codex: { agent: "codex", available: true },
      opencode: { agent: "opencode", available: true },
    });
  });

  it("tells the Candidate without a Codex login where the login is missing and how to log in", () => {
    const { codex } = availability({
      codexAuth: { path: "/home/candidate/.codex/auth.json", exists: false },
    });
    expect(codex).toStrictEqual({
      agent: "codex",
      available: false,
      reason:
        "Нет входа в Codex: не найден /home/candidate/.codex/auth.json. Выполните `codex login` и обновите страницу.",
    });
  });

  it("tells the Candidate without OpenCode in PATH to install it", () => {
    const { opencode } = availability({ opencodeBinary: null });
    expect(opencode).toStrictEqual({
      agent: "opencode",
      available: false,
      reason:
        "OpenCode не установлен: команда `opencode` не найдена в PATH. Установите OpenCode и перезапустите приложение.",
    });
  });

  it("tells the Candidate when an adapter is missing from the installation", () => {
    const { claude, codex } = availability({ claudeAdapter: null, codexAdapter: null });
    expect(claude).toStrictEqual({
      agent: "claude",
      available: false,
      reason:
        "Адаптер Claude Code не установлен вместе с приложением. Выполните `pnpm install` и перезапустите приложение.",
    });
    expect(codex).toStrictEqual({
      agent: "codex",
      available: false,
      reason:
        "Адаптер Codex не установлен вместе с приложением. Выполните `pnpm install` и перезапустите приложение.",
    });
  });

  it("offers OpenCode without its own login: it can use free models", () => {
    const { opencode } = availability();
    expect(opencode).toStrictEqual({ agent: "opencode", available: true });
  });

  it("always offers the fake agent when the server enables it", () => {
    expect(agentAvailability(["fake"], { ...host, claudeAdapter: null })).toStrictEqual([
      { agent: "fake", available: true },
    ]);
  });
});
