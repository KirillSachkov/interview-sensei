// Seam 2 of #17: the launch recipe of each agent and session kind as a pure function. The recipes
// follow the isolation section of the spec (#15); the paths are made up, nothing touches the disk.
// The tests sit at the slice root: domain-is-pure keeps even test imports out of domain/.
import path from "node:path";

import { describe, expect, it } from "vitest";

import type { AgentHost } from "./domain/agent.ts";
import { agentKinds } from "./domain/agent.ts";
import { launchRecipe } from "./domain/launch-recipe.ts";
import type { LaunchRecipe } from "./domain/launch-recipe.ts";

const dataDirectory = "/home/candidate/.interview-sensei";
const sessionDirectory = `${dataDirectory}/sessions/0b5c`;

const host: AgentHost = {
  nodeExecutable: "/usr/local/bin/node",
  fakeAgentScript: "/app/fake-agent.ts",
  claudeAdapter: "/app/node_modules/claude-agent-acp/dist/index.js",
  codexAdapter: "/app/node_modules/codex-acp/dist/index.js",
  opencodeBinary: "/opt/homebrew/bin/opencode",
  codexAuth: { path: "/home/candidate/.codex/auth.json", exists: true },
  opencodeAuth: { path: "/home/candidate/.local/share/opencode/auth.json", exists: true },
};

function recipe(agent: (typeof agentKinds)[number], changes: Partial<AgentHost> = {}) {
  return launchRecipe({
    agent,
    sessionKind: "service-chat",
    host: { ...host, ...changes },
    dataDirectory,
    sessionDirectory,
  });
}

/** Every place the agent's start writes to: its `cwd`, prepared files and the homes in its env. */
function writeLocations(launch: LaunchRecipe): string[] {
  const homes = Object.entries(launch.env)
    .filter(([name]) => name === "HOME" || name.endsWith("_HOME"))
    .map(([, value]) => value);
  return [
    launch.cwd,
    ...launch.directories,
    ...launch.files.map((file) => file.path),
    ...launch.symlinks.map((symlink) => symlink.path),
    ...homes,
  ];
}

function isInside(directory: string, location: string): boolean {
  const relative = path.relative(directory, location);
  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
}

describe("launch recipe", () => {
  it("starts Claude Code through its adapter, isolated by SDK options, in the default mode", () => {
    expect(recipe("claude")).toStrictEqual({
      command: host.nodeExecutable,
      args: [host.claudeAdapter],
      env: {
        CLAUDE_CODE_DISABLE_AUTO_MEMORY: "1",
        ENABLE_CLAUDEAI_MCP_SERVERS: "false",
        CLAUDE_CODE_DISABLE_BUNDLED_SKILLS: "1",
        DISABLE_AUTOUPDATER: "1",
      },
      sessionMeta: {
        claudeCode: {
          options: {
            settingSources: [],
            strictMcpConfig: true,
            skills: [],
            allowDangerouslySkipPermissions: false,
            persistSession: false,
          },
        },
      },
      mode: "default",
      cwd: sessionDirectory,
      directories: [sessionDirectory],
      files: [],
      symlinks: [],
    });
  });

  it("leaves the Claude configuration directory alone, so the Keychain login keeps working", () => {
    expect(Object.keys(recipe("claude").env)).not.toContain("CLAUDE_CONFIG_DIR");
    expect(Object.keys(recipe("claude").env)).not.toContain("HOME");
  });

  it("starts Codex with its own homes in the data directory and the login linked in", () => {
    const codexHome = `${dataDirectory}/agents/codex/codex-home`;
    const home = `${dataDirectory}/agents/codex/home`;
    expect(recipe("codex")).toStrictEqual({
      command: host.nodeExecutable,
      args: [host.codexAdapter],
      env: { CODEX_HOME: codexHome, HOME: home, INITIAL_AGENT_MODE: "read-only" },
      sessionMeta: null,
      mode: "read-only",
      cwd: sessionDirectory,
      directories: [codexHome, home, sessionDirectory],
      files: [
        {
          path: `${codexHome}/config.toml`,
          content: "project_doc_max_bytes = 0\n\n[skills.bundled]\nenabled = false\n",
        },
      ],
      symlinks: [{ path: `${codexHome}/auth.json`, target: host.codexAuth.path }],
    });
  });

  it("starts OpenCode from PATH with its own XDG directories and limits from its config", () => {
    const root = `${dataDirectory}/agents/opencode`;
    const { env, ...launch } = recipe("opencode");
    const { OPENCODE_CONFIG_CONTENT: config, ...homesAndFlags } = env;
    expect({ ...launch, env: homesAndFlags }).toStrictEqual({
      command: host.opencodeBinary,
      args: ["acp"],
      env: {
        XDG_CONFIG_HOME: `${root}/config`,
        XDG_DATA_HOME: `${root}/data`,
        XDG_STATE_HOME: `${root}/state`,
        XDG_CACHE_HOME: `${root}/cache`,
        OPENCODE_DISABLE_CLAUDE_CODE: "1",
        OPENCODE_DISABLE_EXTERNAL_SKILLS: "1",
        OPENCODE_DISABLE_PROJECT_CONFIG: "1",
      },
      sessionMeta: null,
      mode: null,
      cwd: sessionDirectory,
      directories: [
        `${root}/config`,
        `${root}/data/opencode`,
        `${root}/state`,
        `${root}/cache`,
        sessionDirectory,
      ],
      files: [],
      symlinks: [{ path: `${root}/data/opencode/auth.json`, target: host.opencodeAuth.path }],
    });
    expect(JSON.parse(String(config))).toStrictEqual({
      autoupdate: false,
      share: "disabled",
      permission: { edit: "ask", bash: "ask", webfetch: "ask", external_directory: "ask" },
    });
  });

  it("links no OpenCode login that the Candidate does not have", () => {
    const launch = recipe("opencode", {
      opencodeAuth: { path: host.opencodeAuth.path, exists: false },
    });
    expect(launch.symlinks).toStrictEqual([]);
  });

  it("starts the fake agent with Node.js and nothing to prepare but its session directory", () => {
    expect(recipe("fake")).toStrictEqual({
      command: host.nodeExecutable,
      args: [host.fakeAgentScript],
      env: {},
      sessionMeta: null,
      mode: null,
      cwd: sessionDirectory,
      directories: [sessionDirectory],
      files: [],
      symlinks: [],
    });
  });

  it.each(agentKinds)("writes only inside the data directory for %s", (agent) => {
    const outside = writeLocations(recipe(agent)).filter(
      (location) => !isInside(dataDirectory, location),
    );
    expect(outside).toStrictEqual([]);
  });

  it.each(agentKinds)("never asks %s to skip permissions", (agent) => {
    const launch = JSON.stringify(recipe(agent));
    expect(launch).not.toMatch(/bypassPermissions|agent-full-access|"allow"/u);
    expect(launch).not.toContain('"allowDangerouslySkipPermissions":true');
  });

  it("links the Codex login instead of copying it", () => {
    const launch = recipe("codex");
    expect(launch.files.map((file) => file.path)).not.toContainEqual(
      expect.stringMatching(/auth\.json$/u),
    );
  });

  it("refuses to start an agent that is not installed", () => {
    expect(() => recipe("claude", { claudeAdapter: null })).toThrow(/claude/u);
    expect(() => recipe("codex", { codexAdapter: null })).toThrow(/codex/u);
    expect(() => recipe("opencode", { opencodeBinary: null })).toThrow(/opencode/u);
  });
});
