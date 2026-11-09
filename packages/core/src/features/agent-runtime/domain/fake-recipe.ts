// The fake ACP agent of tests and manual checks: the role and the skill as Codex gets them, the
// bans in `_meta`, so tests see what each profile asks for.
import { agentsSkillsRoot } from "./recipe.ts";
import type { LaunchRecipe, LaunchRequest } from "./recipe.ts";

export function fakeRecipe({
  host,
  profile,
  dataDirectory,
  sessionDirectory,
}: LaunchRequest): LaunchRecipe {
  const skill = agentsSkillsRoot(dataDirectory, "fake", profile.skill);
  return {
    command: host.nodeExecutable,
    args: [host.fakeAgentScript],
    env: {},
    sessionMeta: {
      fakeAgent: {
        disallowedTools: [...(profile.shell ? [] : ["shell"]), ...(profile.web ? [] : ["web"])],
      },
    },
    systemPrompt: profile.role,
    additionalDirectories: [skill.root],
    mode: null,
    cwd: sessionDirectory,
    dataDirectory,
    directories: [...skill.directories, sessionDirectory],
    files: skill.files,
    symlinks: [],
    syncedDirectories: [skill.directory],
  };
}
