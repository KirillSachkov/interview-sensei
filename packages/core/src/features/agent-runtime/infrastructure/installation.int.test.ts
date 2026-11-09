// What the server finds about the agents on a machine. A temporary directory stands for the
// Candidate's home and PATH, so the test never reads the real ones.
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it, onTestFinished } from "vitest";

import { agentAvailability } from "../domain/agent.ts";
import { inspectAgentHost } from "./installation.ts";

async function temporaryHome(): Promise<string> {
  const home = await mkdtemp(path.join(tmpdir(), "interview-sensei-home-"));
  onTestFinished(async () => {
    await rm(home, { recursive: true, force: true });
  });
  return home;
}

async function placeFile(file: string, mode = 0o600): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, "{}");
  await chmod(file, mode);
}

async function availabilityIn(home: string, env: Record<string, string> = {}) {
  const host = await inspectAgentHost({ home, env })();
  const [codex, opencode] = agentAvailability(["codex", "opencode"], host);
  return { codex, opencode };
}

describe("agent host inspection", () => {
  it("finds both adapters in the installation's dependencies", async () => {
    const host = await inspectAgentHost({ home: await temporaryHome(), env: {} })();

    expect(host.claudeAdapter).toMatch(/claude-agent-acp[/\\]dist[/\\]index\.js$/u);
    expect(host.codexAdapter).toMatch(/codex-acp[/\\]dist[/\\]index\.js$/u);
  });

  it("makes Codex unavailable without auth.json in the home's .codex", async () => {
    const home = await temporaryHome();

    const { codex } = await availabilityIn(home);

    expect(codex).toStrictEqual({
      agent: "codex",
      available: false,
      reason: `Нет входа в Codex: не найден ${path.join(home, ".codex", "auth.json")}. Выполните \`codex login\` и обновите страницу.`,
    });
  });

  it("offers Codex once auth.json is in the home's .codex", async () => {
    const home = await temporaryHome();
    await placeFile(path.join(home, ".codex", "auth.json"));

    const { codex } = await availabilityIn(home);

    expect(codex).toStrictEqual({ agent: "codex", available: true });
  });

  it("looks for the Codex login in CODEX_HOME when the Candidate set it", async () => {
    const home = await temporaryHome();
    const codexHome = path.join(home, "elsewhere");
    await placeFile(path.join(codexHome, "auth.json"));

    const host = await inspectAgentHost({ home, env: { CODEX_HOME: codexHome } })();

    expect(host.codexAuth).toStrictEqual({ path: path.join(codexHome, "auth.json"), exists: true });
  });

  it("makes OpenCode unavailable without an executable opencode in PATH", async () => {
    const home = await temporaryHome();
    const bin = path.join(home, "bin");
    await placeFile(path.join(bin, "opencode"), 0o600);

    const { opencode } = await availabilityIn(home, { PATH: bin });

    expect(opencode).toMatchObject({ agent: "opencode", available: false });
  });

  it("finds the first executable opencode in PATH", async () => {
    const home = await temporaryHome();
    const first = path.join(home, "first");
    const second = path.join(home, "second");
    await placeFile(path.join(second, "opencode"), 0o700);

    const host = await inspectAgentHost({
      home,
      env: { PATH: [first, second].join(path.delimiter) },
    })();

    expect(host.opencodeBinary).toBe(path.join(second, "opencode"));
  });

  it("finds the OpenCode provider keys in the home's XDG data directory", async () => {
    const home = await temporaryHome();
    await placeFile(path.join(home, ".local", "share", "opencode", "auth.json"));

    const host = await inspectAgentHost({ home, env: {} })();

    expect(host.opencodeAuth.exists).toBe(true);
  });

  it("takes the Candidate's OpenCode model from the home's .config without changing the file", async () => {
    const home = await temporaryHome();
    const file = path.join(home, ".config", "opencode", "opencode.json");
    const content = '{"model":"deepseek/deepseek-flash","mcp":{"notes":{}}}';
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, content);

    const host = await inspectAgentHost({ home, env: {} })();

    expect(host.opencodeModel).toStrictEqual({ model: "deepseek/deepseek-flash" });
    await expect(readFile(file, "utf8")).resolves.toBe(content);
  });

  it("reads opencode.jsonc in XDG_CONFIG_HOME when the Candidate set it", async () => {
    const home = await temporaryHome();
    const configHome = path.join(home, "xdg");
    await mkdir(path.join(configHome, "opencode"), { recursive: true });
    await writeFile(path.join(configHome, "opencode", "opencode.jsonc"), '{"small_model":"a/b",}');

    const host = await inspectAgentHost({ home, env: { XDG_CONFIG_HOME: configHome } })();

    expect(host.opencodeModel).toStrictEqual({ small_model: "a/b" });
  });

  it("takes no OpenCode model from a missing or unreadable config", async () => {
    const home = await temporaryHome();
    await mkdir(path.join(home, ".config", "opencode", "opencode.json"), { recursive: true });

    const host = await inspectAgentHost({ home, env: {} })();

    expect(host.opencodeModel).toStrictEqual({});
  });
});
