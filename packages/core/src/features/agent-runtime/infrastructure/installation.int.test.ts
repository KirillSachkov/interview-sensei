// What the server finds about the agents on a machine. A temporary directory stands for the
// Candidate's home and PATH, so the test never reads the real ones.
import { chmod, mkdir, mkdtemp, readFile, rm, watch, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it, onTestFinished } from "vitest";

import type { Timer } from "../../../shared/time/index.ts";
import { agentAvailability } from "../domain/agent.ts";
import { opencodeConfigSchema } from "../domain/opencode-recipe.ts";
import { inspectAgentHost } from "./installation.ts";

/** A timer that never runs a task: these inspections answer before any timeout. */
const idleTimer: Timer = { repeat: () => () => {}, after: () => () => {} };

/** A timer whose one delayed task the test runs by hand, as if its delay had passed. */
function handTimer() {
  const scheduled = Promise.withResolvers<() => void>();
  const timer: Timer = {
    repeat: () => () => {},
    after: (_delayMs, task) => {
      scheduled.resolve(task);
      return () => {};
    },
  };
  return { timer, scheduled: scheduled.promise };
}

/** Resolves once the file exists in its directory; waits on file events, never sleeps. */
async function fileAppears(file: string): Promise<void> {
  const events = watch(path.dirname(file));
  if (await exists(file)) {
    return;
  }
  for await (const event of events) {
    if (event.filename === path.basename(file) && (await exists(file))) {
      return;
    }
  }
}

async function exists(file: string): Promise<boolean> {
  try {
    await readFile(file);
    return true;
  } catch {
    return false;
  }
}

/**
 * A stub `opencode` that never answers: it ignores SIGTERM, and `exec` keeps that for the sleep
 * that holds stdout open. It writes its process id to `pidFile` first.
 */
async function hangingOpencode() {
  const home = await temporaryHome();
  const bin = path.join(home, "bin");
  const pidFile = path.join(home, "pid");
  await mkdir(bin, { recursive: true });
  const script = path.join(bin, "opencode");
  await writeFile(script, `#!/bin/sh\ntrap '' TERM\necho $$ > '${pidFile}'\nexec /bin/sleep 600\n`);
  await chmod(script, 0o700);
  return { home, bin, pidFile };
}

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

/**
 * A stub `opencode` in `bin` that prints `output` for `--version` and exits with `code`; it keeps
 * its arguments in `calls`, so the test sees that nothing but `--version` ran.
 */
async function stubOpencode(bin: string, { output, code = 0 }: { output: string; code?: number }) {
  const calls = path.join(bin, "calls");
  const script = path.join(bin, "opencode");
  await mkdir(bin, { recursive: true });
  await writeFile(
    script,
    `#!/bin/sh\necho "$@" >> '${calls}'\nprintf '%s\\n' '${output}'\nexit ${String(code)}\n`,
  );
  await chmod(script, 0o700);
  return { calls };
}

async function availabilityIn(home: string, env: Record<string, string> = {}) {
  const host = await inspectAgentHost({ home, env }, idleTimer)();
  const [codex, opencode] = agentAvailability(["codex", "opencode"], host);
  return { codex, opencode };
}

describe("agent host inspection", () => {
  it("finds both adapters in the installation's dependencies", async () => {
    const host = await inspectAgentHost({ home: await temporaryHome(), env: {} }, idleTimer)();

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

    const host = await inspectAgentHost({ home, env: { CODEX_HOME: codexHome } }, idleTimer)();

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

    const env = { PATH: [first, second].join(path.delimiter) };
    const host = await inspectAgentHost({ home, env }, idleTimer)();

    expect(host.opencodeBinary).toBe(path.join(second, "opencode"));
  });

  it("finds the OpenCode provider keys in the home's XDG data directory", async () => {
    const home = await temporaryHome();
    await placeFile(path.join(home, ".local", "share", "opencode", "auth.json"));

    const host = await inspectAgentHost({ home, env: {} }, idleTimer)();

    expect(host.opencodeAuth.exists).toBe(true);
  });

  it("takes the Candidate's OpenCode model from the home's .config without changing the file", async () => {
    const home = await temporaryHome();
    const file = path.join(home, ".config", "opencode", "opencode.json");
    const content = '{"model":"deepseek/deepseek-flash","mcp":{"notes":{}}}';
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, content);

    const host = await inspectAgentHost({ home, env: {} }, idleTimer)();

    expect(host.opencodeModel).toStrictEqual({ model: "deepseek/deepseek-flash" });
    await expect(readFile(file, "utf8")).resolves.toBe(content);
  });

  it("reads opencode.jsonc in XDG_CONFIG_HOME when the Candidate set it", async () => {
    const home = await temporaryHome();
    const configHome = path.join(home, "xdg");
    await mkdir(path.join(configHome, "opencode"), { recursive: true });
    await writeFile(path.join(configHome, "opencode", "opencode.jsonc"), '{"small_model":"a/b",}');

    const host = await inspectAgentHost(
      { home, env: { XDG_CONFIG_HOME: configHome } },
      idleTimer,
    )();

    expect(host.opencodeModel).toStrictEqual({ small_model: "a/b" });
  });

  it("takes no OpenCode model from a missing or unreadable config", async () => {
    const home = await temporaryHome();
    await mkdir(path.join(home, ".config", "opencode", "opencode.json"), { recursive: true });

    const host = await inspectAgentHost({ home, env: {} }, idleTimer)();

    expect(host.opencodeModel).toStrictEqual({});
  });
});

describe("opencode version inspection", () => {
  it.each([
    ["opencode v2.2.6", "2.x"],
    ["1.18.30", "1.x"],
  ])("asks only `opencode --version`, which prints %s, for the version", async (output, schema) => {
    const home = await temporaryHome();
    const bin = path.join(home, "bin");
    const { calls } = await stubOpencode(bin, { output });

    const host = await inspectAgentHost({ home, env: { PATH: bin } }, idleTimer)();

    expect(host.opencodeVersion).toBe(output);
    expect(opencodeConfigSchema(host.opencodeVersion)).toBe(schema);
    await expect(readFile(calls, "utf8")).resolves.toBe("--version\n");
  });

  it("knows no OpenCode version when `opencode --version` fails or OpenCode is missing", async () => {
    const home = await temporaryHome();
    const bin = path.join(home, "bin");
    await stubOpencode(bin, { output: "opencode v2.2.6", code: 1 });

    const failed = await inspectAgentHost({ home, env: { PATH: bin } }, idleTimer)();
    const missing = await inspectAgentHost(
      { home, env: { PATH: path.join(home, "none") } },
      idleTimer,
    )();

    expect(failed.opencodeVersion).toBeNull();
    expect(missing.opencodeVersion).toBeNull();
  });

  it("gives up on an `opencode --version` that hangs and ignores SIGTERM, and kills it", async () => {
    const { home, bin, pidFile } = await hangingOpencode();
    const { timer, scheduled } = handTimer();

    const inspected = inspectAgentHost({ home, env: { PATH: bin } }, timer)();
    await fileAppears(pidFile);
    const timeout = await scheduled;
    timeout();
    const host = await inspected;

    expect(host.opencodeVersion).toBeNull();
    const pid = Number(await readFile(pidFile, "utf8"));
    expect(() => process.kill(pid, 0)).toThrow(/ESRCH/u);
  });
});
