// The made-up machine, data directory and profiles of the launch recipe tests; nothing touches
// the disk.
import path from "node:path";

import type { AgentHost, AgentKind } from "./domain/agent.ts";
import { launchRecipe } from "./domain/launch-recipe.ts";
import type { LaunchProfile, LaunchRecipe } from "./domain/launch-recipe.ts";

export const dataDirectory = "/home/candidate/.interview-sensei";
export const sessionDirectory = `${dataDirectory}/sessions/0b5c`;

export const host: AgentHost = {
  nodeExecutable: "/usr/local/bin/node",
  fakeAgentScript: "/app/fake-agent.ts",
  claudeAdapter: "/app/node_modules/claude-agent-acp/dist/index.js",
  codexAdapter: "/app/node_modules/codex-acp/dist/index.js",
  opencodeBinary: "/opt/homebrew/bin/opencode",
  opencodeVersion: "opencode v2.2.6",
  codexAuth: { path: "/home/candidate/.codex/auth.json", exists: true },
  opencodeAuth: { path: "/home/candidate/.local/share/opencode/auth.json", exists: true },
  opencodeKeys: [],
  opencodeModel: {},
};

export const skillText = "---\nname: probe-skill\ndescription: Probes the agent.\n---\n\nProbe.\n";
export const notesText = "Notes of the probe skill.\n";

/** A profile that forbids shell and web, as most session kinds do. */
export const lockedProfile: LaunchProfile = {
  role: "You are the probe role of Interview Sensei.",
  skill: {
    name: "probe-skill",
    files: [
      { path: "SKILL.md", content: skillText },
      { path: "references/notes.md", content: notesText },
    ],
  },
  shell: false,
  web: false,
};

/** The same profile with shell and web allowed. */
export const openProfile: LaunchProfile = { ...lockedProfile, shell: true, web: true };

export function recipe(
  agent: AgentKind,
  changes: Partial<AgentHost> = {},
  profile: LaunchProfile = lockedProfile,
) {
  return launchRecipe({
    agent,
    profile,
    host: { ...host, ...changes },
    dataDirectory,
    sessionDirectory,
  });
}

/** What `opencode --version` prints for each config schema: 2.x as `opencode v…`, 1.x bare. */
export const opencodeVersions = { v1: "1.18.30", v2: "opencode v2.2.6" } as const;

/** The OpenCode config the recipe passes in OPENCODE_CONFIG_CONTENT. */
export function opencodeConfig(
  profile: LaunchProfile = lockedProfile,
  changes: Partial<AgentHost> = {},
): Record<string, unknown> {
  const config: unknown = JSON.parse(
    String(recipe("opencode", changes, profile).env.OPENCODE_CONFIG_CONTENT),
  );
  if (typeof config !== "object" || config === null) {
    throw new Error("The OpenCode config is not an object");
  }
  return { ...config };
}

/** The skill copy of the recipe: every prepared file under the root, by its path below the root. */
export function filesBelow(launch: LaunchRecipe, root: string): Record<string, string> {
  return Object.fromEntries(
    launch.files
      .filter((file) => file.path.startsWith(`${root}/`))
      .map((file) => [file.path.slice(root.length + 1), file.content]),
  );
}

export function isInside(directory: string, location: string): boolean {
  const relative = path.relative(directory, location);
  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
}
