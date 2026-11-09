// OpenCode as `opencode acp` from PATH: its own XDG directories, and the role, the skill and the
// bans in OPENCODE_CONFIG_CONTENT; OpenCode reads no `_meta` and has no ACP system prompt.
import { child, applicationName, required, skillCopy } from "./recipe.ts";
import type { AgentHost } from "./agent.ts";
import type { LaunchProfile, LaunchRecipe, LaunchRequest } from "./recipe.ts";

/** OpenCode has no permission modes; its config asks the Candidate before changes. */
const opencodeConfig = {
  // Neither the Candidate's OpenCode installation nor a shared link may change.
  autoupdate: false,
  share: "disabled",
  permission: { edit: "ask", bash: "ask", webfetch: "ask", external_directory: "ask" },
};

/**
 * OpenCode's own agent for the session: the role replaces OpenCode's base prompt, and the bans
 * deny its tools over the shared `ask`. The keys are those of OpenCode 1.x, which 2.x still reads.
 */
function opencodeAgent({ role, shell, web }: LaunchProfile) {
  return {
    mode: "primary",
    description: "The agent of an Interview Sensei session",
    prompt: role,
    permission: {
      ...(shell ? {} : { bash: "deny" }),
      ...(web ? {} : { webfetch: "deny", websearch: "deny" }),
    },
  };
}

/** OpenCode's own XDG directories in the data directory. */
function opencodeHomes(root: string) {
  return {
    XDG_CONFIG_HOME: child(root, "config"),
    XDG_DATA_HOME: child(root, "data"),
    XDG_STATE_HOME: child(root, "state"),
    XDG_CACHE_HOME: child(root, "cache"),
  };
}

/** The whole config of the session: the Candidate's model, our limits, the skill and the agent. */
function opencodeConfigContent(host: AgentHost, profile: LaunchProfile, skillsPath: string) {
  return JSON.stringify({
    ...host.opencodeModel,
    ...opencodeConfig,
    skills: { paths: [skillsPath] },
    agent: { [applicationName]: opencodeAgent(profile) },
  });
}

export function opencodeRecipe({
  host,
  profile,
  dataDirectory,
  sessionDirectory,
}: LaunchRequest): LaunchRecipe {
  const root = child(dataDirectory, "agents", "opencode");
  const skillsPath = child(root, "skills", profile.skill.name);
  const skill = skillCopy(child(skillsPath, profile.skill.name), profile.skill);
  const homes = opencodeHomes(root);
  const ownData = child(homes.XDG_DATA_HOME, "opencode");
  return {
    command: required(host.opencodeBinary, "opencode"),
    args: ["acp"],
    env: {
      ...homes,
      OPENCODE_DISABLE_CLAUDE_CODE: "1",
      OPENCODE_DISABLE_EXTERNAL_SKILLS: "1",
      OPENCODE_DISABLE_PROJECT_CONFIG: "1",
      OPENCODE_CONFIG_CONTENT: opencodeConfigContent(host, profile, skillsPath),
    },
    sessionMeta: null,
    // OpenCode has no ACP system prompt; its own agent carries the role.
    systemPrompt: null,
    additionalDirectories: [],
    // OpenCode offers its primary agents as modes.
    mode: applicationName,
    cwd: sessionDirectory,
    dataDirectory,
    directories: [
      homes.XDG_CONFIG_HOME,
      ownData,
      homes.XDG_STATE_HOME,
      homes.XDG_CACHE_HOME,
      ...skill.directories,
      sessionDirectory,
    ],
    files: skill.files,
    // A link to a missing file would make OpenCode create the Candidate's file on login.
    symlinks: host.opencodeAuth.exists
      ? [{ path: child(ownData, "auth.json"), target: host.opencodeAuth.path }]
      : [],
    syncedDirectories: [skill.directory],
  };
}
