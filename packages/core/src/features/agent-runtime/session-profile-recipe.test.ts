// Seam 1 of #42: how each recipe translates the session's profile. The role, the skill and the
// bans reach every agent by its own lever, and only when the profile asks for them.
import { describe, expect, it } from "vitest";

import { agentKinds } from "./domain/agent.ts";
import type { LaunchProfile } from "./domain/launch-recipe.ts";
import {
  dataDirectory,
  filesBelow,
  isInside,
  lockedProfile,
  notesText,
  openProfile,
  opencodeConfig,
  opencodeVersions,
  recipe,
  skillText,
} from "./launch-recipe-test-support.ts";

/** The `_meta` of Claude Code's session as JSON, for the profile. */
function disallowed(profile: LaunchProfile): string {
  return JSON.stringify(recipe("claude", {}, profile).sessionMeta);
}

/** CODEX_CONFIG of the Codex recipe for the profile. */
function codexConfig(profile: LaunchProfile): string | undefined {
  return recipe("codex", {}, profile).env.CODEX_CONFIG;
}

const v1 = { opencodeVersion: opencodeVersions.v1 };
const v2 = { opencodeVersion: opencodeVersions.v2 };

/** The `agent` section of the OpenCode 1.x config as JSON, for the profile. */
function permission(profile: LaunchProfile): string {
  return JSON.stringify(opencodeConfig(profile, v1).agent);
}

/** A 2.x rule that denies the action, as JSON. */
function deny(action: string): string {
  return `{"action":"${action}","resource":"*","effect":"deny"}`;
}

/** The `agents` section of the OpenCode 2.x config as JSON, for the profile. */
function permissions(profile: LaunchProfile): string {
  return JSON.stringify(opencodeConfig(profile, v2).agents);
}

describe("session profile role and skill in the launch recipe", () => {
  it("gives Claude Code, Codex and the fake agent the role as an appended ACP system prompt", () => {
    for (const agent of ["claude", "codex", "fake"] as const) {
      expect(recipe(agent).systemPrompt).toBe(lockedProfile.role);
    }
  });

  it("gives OpenCode the role in its own primary agent, which the server selects as the mode", () => {
    const launch = recipe("opencode");
    expect(launch.systemPrompt).toBeNull();
    expect(launch.mode).toBe("interview-sensei");
    expect(opencodeConfig(lockedProfile, v1)).toMatchObject({
      agent: { "interview-sensei": { mode: "primary", prompt: lockedProfile.role } },
    });
    expect(opencodeConfig(lockedProfile, v2)).toMatchObject({
      default_agent: "interview-sensei",
      agents: { "interview-sensei": { mode: "primary", system: lockedProfile.role } },
    });
  });

  it("gives Claude Code exactly the profile's skill as a local plugin", () => {
    const plugin = `${dataDirectory}/agents/claude/skills/probe-skill`;
    const launch = recipe("claude");
    expect(launch.sessionMeta).toMatchObject({
      claudeCode: {
        options: {
          plugins: [{ type: "local", path: plugin }],
          skills: ["interview-sensei:probe-skill"],
        },
      },
    });
    expect(filesBelow(launch, `${plugin}/skills`)).toStrictEqual({
      "probe-skill/SKILL.md": skillText,
      "probe-skill/references/notes.md": notesText,
    });
  });

  it.each(["codex", "fake"] as const)(
    "gives %s exactly the profile's skill in .agents/skills of one additional directory",
    (agent) => {
      const launch = recipe(agent);
      expect(launch.additionalDirectories).toHaveLength(1);
      const [root = ""] = launch.additionalDirectories;
      expect(filesBelow(launch, `${root}/.agents/skills`)).toStrictEqual({
        "probe-skill/SKILL.md": skillText,
        "probe-skill/references/notes.md": notesText,
      });
    },
  );

  it("gives OpenCode exactly the profile's skill in the one skills path of its config", () => {
    const launch = recipe("opencode");
    const skillsPath = `${dataDirectory}/agents/opencode/skills/probe-skill`;
    expect(opencodeConfig(lockedProfile, v1).skills).toStrictEqual({ paths: [skillsPath] });
    expect(opencodeConfig(lockedProfile, v2).skills).toStrictEqual([skillsPath]);
    expect(filesBelow(launch, `${dataDirectory}/agents/opencode/skills/probe-skill`)).toStrictEqual(
      {
        "probe-skill/SKILL.md": skillText,
        "probe-skill/references/notes.md": notesText,
      },
    );
  });
});

describe("session profile bans in the launch recipe", () => {
  it("removes shell and web tools from Claude Code only when the profile forbids them", () => {
    expect(disallowed({ ...openProfile, shell: false })).toContain('"disallowedTools":["Bash"]');
    expect(disallowed({ ...openProfile, web: false })).toContain(
      '"disallowedTools":["WebFetch","WebSearch"]',
    );
    expect(disallowed(openProfile)).toContain('"disallowedTools":[]');
  });

  it("turns off the shell tool and web search of Codex only when the profile forbids them", () => {
    expect(codexConfig({ ...openProfile, shell: false })).toBe('{"features":{"shell_tool":false}}');
    expect(codexConfig({ ...openProfile, web: false })).toBe('{"web_search":"disabled"}');
    expect(codexConfig(openProfile)).toBeUndefined();
  });

  it("denies shell and web to the OpenCode 1.x agent only when the profile forbids them", () => {
    expect(permission({ ...openProfile, shell: false })).toContain('"permission":{"bash":"deny"}');
    expect(permission({ ...openProfile, web: false })).toContain(
      '"permission":{"webfetch":"deny","websearch":"deny"}',
    );
    expect(permission(openProfile)).toContain('"permission":{}');
  });

  it("denies shell and web to the OpenCode 2.x agent only when the profile forbids them", () => {
    expect(permissions({ ...openProfile, shell: false })).toContain(
      `"permissions":[${deny("shell")}]`,
    );
    expect(permissions({ ...openProfile, web: false })).toContain(
      `"permissions":[${deny("webfetch")},${deny("websearch")}]`,
    );
    expect(permissions(openProfile)).toContain('"permissions":[]');
  });

  it("tells the fake agent the bans only when the profile forbids them", () => {
    expect(recipe("fake", {}, { ...openProfile, web: false }).sessionMeta).toStrictEqual({
      fakeAgent: { disallowedTools: ["web"] },
    });
    expect(recipe("fake", {}, openProfile).sessionMeta).toStrictEqual({
      fakeAgent: { disallowedTools: [] },
    });
  });

  it.each(agentKinds)("keeps the permission mode of %s whatever the profile allows", (agent) => {
    expect(recipe(agent, {}, openProfile).mode).toBe(recipe(agent).mode);
  });

  it.each(agentKinds)("keeps the skill copy of %s in its data directory", (agent) => {
    const launch = recipe(agent);
    const skillFiles = launch.files.filter((file) => file.path.includes("/probe-skill/"));
    expect(skillFiles.length).toBeGreaterThanOrEqual(2);
    expect(
      skillFiles.filter((file) => !isInside(`${dataDirectory}/agents/${agent}`, file.path)),
    ).toStrictEqual([]);
  });
});
