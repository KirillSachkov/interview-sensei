// Seam 2 of #17 and seam 1 of #42: the launch recipe of each agent and session profile as a pure
// function. The recipes follow the isolation section of #15 and the profile translation of #42;
// the paths, the role and the skill are made up, nothing touches the disk.
// The tests sit at the slice root: domain-is-pure keeps even test imports out of domain/.
import { describe, expect, it } from "vitest";

import { agentKinds } from "./domain/agent.ts";
import { agentEnvironment } from "./domain/launch-recipe.ts";
import type { LaunchRecipe } from "./domain/launch-recipe.ts";
import {
  dataDirectory,
  host,
  isInside,
  lockedProfile,
  notesText,
  opencodeVersions,
  recipe,
  sessionDirectory,
  skillText,
} from "./launch-recipe-test-support.ts";

/** Every place the agent's start writes to: its `cwd`, prepared files and the homes in its env. */
function writeLocations(launch: LaunchRecipe): string[] {
  const homes = Object.entries(launch.env)
    .filter(([name]) => name === "HOME" || name.endsWith("_HOME"))
    .map(([, value]) => value);
  return [
    launch.cwd,
    ...launch.additionalDirectories,
    ...launch.directories,
    ...launch.files.map((file) => file.path),
    ...launch.symlinks.map((symlink) => symlink.path),
    ...launch.syncedDirectories,
    ...homes,
  ];
}

describe("launch recipe", () => {
  it("starts Claude Code through its adapter, isolated by SDK options, in the default mode", () => {
    const plugin = `${dataDirectory}/agents/claude/skills/probe-skill`;
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
            plugins: [{ type: "local", path: plugin }],
            skills: ["interview-sensei:probe-skill"],
            allowedTools: [],
            disallowedTools: ["Bash", "WebFetch", "WebSearch"],
            allowDangerouslySkipPermissions: false,
            persistSession: false,
          },
        },
      },
      systemPrompt: lockedProfile.role,
      additionalDirectories: [],
      mode: "default",
      cwd: sessionDirectory,
      dataDirectory,
      directories: [
        `${plugin}/.claude-plugin`,
        `${plugin}/skills/probe-skill`,
        `${plugin}/skills/probe-skill/references`,
        sessionDirectory,
      ],
      files: [
        { path: `${plugin}/.claude-plugin/plugin.json`, content: '{"name":"interview-sensei"}\n' },
        { path: `${plugin}/skills/probe-skill/SKILL.md`, content: skillText },
        { path: `${plugin}/skills/probe-skill/references/notes.md`, content: notesText },
      ],
      symlinks: [],
      syncedDirectories: [`${plugin}/skills/probe-skill`],
    });
  });

  it("leaves the Claude configuration directory alone, so the Keychain login keeps working", () => {
    expect(Object.keys(recipe("claude").env)).not.toContain("CLAUDE_CONFIG_DIR");
    expect(Object.keys(recipe("claude").env)).not.toContain("HOME");
  });

  it("starts Codex with its own homes in the data directory and the login linked in", () => {
    const codexHome = `${dataDirectory}/agents/codex/codex-home`;
    const home = `${dataDirectory}/agents/codex/home`;
    const skills = `${dataDirectory}/agents/codex/skills/probe-skill`;
    // session-profile-recipe.test.ts checks the system prompt.
    const { systemPrompt, ...launch } = recipe("codex");
    expect(systemPrompt?.startsWith(lockedProfile.role)).toBe(true);
    expect(launch).toStrictEqual({
      command: host.nodeExecutable,
      args: [host.codexAdapter],
      env: {
        CODEX_HOME: codexHome,
        HOME: home,
        INITIAL_AGENT_MODE: "read-only",
        CODEX_CONFIG: '{"features":{"shell_tool":false},"web_search":"disabled"}',
      },
      sessionMeta: null,
      additionalDirectories: [skills],
      mode: "read-only",
      cwd: sessionDirectory,
      dataDirectory,
      directories: [
        codexHome,
        home,
        `${skills}/.agents/skills/probe-skill`,
        `${skills}/.agents/skills/probe-skill/references`,
        sessionDirectory,
      ],
      files: [
        {
          path: `${codexHome}/config.toml`,
          content:
            "project_doc_max_bytes = 0\n\n[features]\napps = false\nplugins = false\n\n" +
            "[skills.bundled]\nenabled = false\n",
        },
        { path: `${skills}/.agents/skills/probe-skill/SKILL.md`, content: skillText },
        { path: `${skills}/.agents/skills/probe-skill/references/notes.md`, content: notesText },
      ],
      symlinks: [{ path: `${codexHome}/auth.json`, target: host.codexAuth.path }],
      syncedDirectories: [`${skills}/.agents/skills/probe-skill`],
    });
  });

  it.each(Object.entries(opencodeVersions))(
    "starts OpenCode %s from PATH with its own XDG directories and its own config",
    (_schema, opencodeVersion) => {
      const root = `${dataDirectory}/agents/opencode`;
      const skills = `${root}/skills/probe-skill`;
      const { env, ...launch } = recipe("opencode", { opencodeVersion });
      const { OPENCODE_CONFIG_CONTENT: config, ...homesAndFlags } = env;
      expect(config).toBeTypeOf("string");
      expect({ ...launch, env: homesAndFlags }).toStrictEqual({
        command: host.opencodeBinary,
        args: ["acp"],
        env: {
          XDG_CONFIG_HOME: `${root}/config`,
          XDG_DATA_HOME: `${root}/data`,
          XDG_STATE_HOME: `${root}/state`,
          XDG_CACHE_HOME: `${root}/cache`,
          OPENCODE_DISABLE_CLAUDE_CODE: "1",
          // 2.2.6 no longer reads this flag; it stays in case a 2.x release reads it again.
          OPENCODE_DISABLE_EXTERNAL_SKILLS: "1",
          OPENCODE_DISABLE_PROJECT_CONFIG: "1",
        },
        sessionMeta: null,
        systemPrompt: null,
        additionalDirectories: [],
        mode: "interview-sensei",
        cwd: sessionDirectory,
        dataDirectory,
        directories: [
          `${root}/config`,
          `${root}/data/opencode`,
          `${root}/state`,
          `${root}/cache`,
          `${skills}/probe-skill`,
          `${skills}/probe-skill/references`,
          sessionDirectory,
        ],
        files: [
          { path: `${skills}/probe-skill/SKILL.md`, content: skillText },
          { path: `${skills}/probe-skill/references/notes.md`, content: notesText },
        ],
        symlinks: [{ path: `${root}/data/opencode/auth.json`, target: host.opencodeAuth.path }],
        syncedDirectories: [`${skills}/probe-skill`],
      });
    },
  );

  it("links no OpenCode login that the Candidate does not have", () => {
    const launch = recipe("opencode", {
      opencodeAuth: { path: host.opencodeAuth.path, exists: false },
    });
    expect(launch.symlinks).toStrictEqual([]);
  });

  it("starts the fake agent with Node.js, the role, the skill and the bans in ACP fields", () => {
    const skills = `${dataDirectory}/agents/fake/skills/probe-skill`;
    expect(recipe("fake")).toStrictEqual({
      command: host.nodeExecutable,
      args: [host.fakeAgentScript],
      env: {},
      sessionMeta: { fakeAgent: { disallowedTools: ["shell", "web"] } },
      systemPrompt: lockedProfile.role,
      additionalDirectories: [skills],
      mode: null,
      cwd: sessionDirectory,
      dataDirectory,
      directories: [
        `${skills}/.agents/skills/probe-skill`,
        `${skills}/.agents/skills/probe-skill/references`,
        sessionDirectory,
      ],
      files: [
        { path: `${skills}/.agents/skills/probe-skill/SKILL.md`, content: skillText },
        { path: `${skills}/.agents/skills/probe-skill/references/notes.md`, content: notesText },
      ],
      symlinks: [],
      syncedDirectories: [`${skills}/.agents/skills/probe-skill`],
    });
  });

  it.each(agentKinds)("writes only inside the data directory for %s", (agent) => {
    const launch = recipe(agent);
    const outside = writeLocations(launch).filter((location) => !isInside(dataDirectory, location));
    expect(launch.dataDirectory).toBe(dataDirectory);
    expect(outside).toStrictEqual([]);
  });

  it.each(agentKinds)("never asks %s to skip permissions", (agent) => {
    const launch = JSON.stringify(recipe(agent, { opencodeVersion: opencodeVersions.v1 }));
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

describe("agent environment", () => {
  const candidate = {
    PATH: "/usr/bin",
    HOME: "/home/candidate",
    ANTHROPIC_API_KEY: "sk-ant-candidate",
    OPENAI_API_KEY: "sk-candidate",
    OPENCODE_CONFIG: "/home/candidate/opencode.json",
    OPENCODE_CONFIG_DIR: "/home/candidate/.opencode",
    OPENCODE_DB: "/home/candidate/opencode.db",
    CLAUDE_CONFIG_DIR: "/home/candidate/.claude-work",
    CODEX_HOME: "/home/candidate/.codex",
    INTERVIEW_SENSEI_DATA_DIR: "/home/candidate/.interview-sensei",
    INTERVIEW_SENSEI_FAKE_AGENT: "1",
    UNSET: undefined,
  };

  it("keeps the Candidate's variables, API keys and Claude configuration directory but drops those that defeat isolation", () => {
    expect(agentEnvironment(candidate, {})).toStrictEqual({
      PATH: "/usr/bin",
      HOME: "/home/candidate",
      ANTHROPIC_API_KEY: "sk-ant-candidate",
      OPENAI_API_KEY: "sk-candidate",
      CLAUDE_CONFIG_DIR: "/home/candidate/.claude-work",
    });
  });

  it("puts the recipe's variables over the Candidate's", () => {
    const env = agentEnvironment(candidate, { CODEX_HOME: "/data/codex-home", HOME: "/data/home" });
    expect(env.CODEX_HOME).toBe("/data/codex-home");
    expect(env.HOME).toBe("/data/home");
  });
});
