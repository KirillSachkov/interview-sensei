// OpenCode as `opencode acp` from PATH: its own XDG directories, and the role, the skill and the
// bans in OPENCODE_CONFIG_CONTENT; OpenCode reads no `_meta` and has no ACP system prompt.
// OpenCode 2.x renamed the config keys; the recipe writes the keys of the installed version.
import { child, applicationName, required, skillCopy } from "./recipe.ts";
import type { AgentHost } from "./agent.ts";
import type { LaunchProfile, LaunchRecipe, LaunchRequest } from "./recipe.ts";

/** The config keys of OpenCode 1.x (`agent`, `prompt`) or of 2.x (`agents`, `system`). */
export type OpencodeConfigSchema = "1.x" | "2.x";

/**
 * The schema for what `opencode --version` printed: `1.18.30` for 1.x, `opencode v2.2.6` for 2.x.
 * An unknown version gets 1.x: 2.x still reads the 1.x keys as deprecated, but older 1.x releases
 * do not read the 2.x keys.
 */
export function opencodeConfigSchema(version: string | null): OpencodeConfigSchema {
  const major = /(?:^|\s|v)(?<major>\d+)\.\d+\.\d+/u.exec(version ?? "")?.groups?.major;
  return major !== undefined && Number(major) >= 2 ? "2.x" : "1.x";
}

const agentDescription = "The agent of an Interview Sensei session";

/**
 * OpenCode 1.x. It has no permission modes; its config asks the Candidate before changes. Our
 * agent's `prompt` replaces OpenCode's base prompt, and its bans deny tools over the shared `ask`.
 */
function configV1({ role, shell, web }: LaunchProfile, skillsPath: string) {
  return {
    // Neither the Candidate's OpenCode installation nor a shared link may change.
    autoupdate: false,
    share: "disabled",
    permission: { edit: "ask", bash: "ask", webfetch: "ask", external_directory: "ask" },
    skills: { paths: [skillsPath] },
    agent: {
      [applicationName]: {
        mode: "primary",
        description: agentDescription,
        prompt: role,
        permission: {
          ...(shell ? {} : { bash: "deny" }),
          ...(web ? {} : { webfetch: "deny", websearch: "deny" }),
        },
      },
    },
  };
}

/** A 2.x permission rule or policy for every resource of the action. */
function rule(action: string, effect: "ask" | "deny") {
  return { action, resource: "*", effect };
}

/**
 * OpenCode 2.x: the same limits in its keys, where `bash` became `shell`. The last matching rule
 * wins, and our agent's rules come after the shared ones. 2.x reads skills from `~/.agents/skills`
 * whatever the flags say, so its policies leave the agent only the profile's skill.
 */
function configV2({ role, shell, web, skill }: LaunchProfile, skillsPath: string) {
  return {
    update: "disable",
    share: "disabled",
    permissions: ["edit", "shell", "webfetch", "external_directory"].map((action) =>
      rule(action, "ask"),
    ),
    policies: [
      rule("skill.use", "deny"),
      { action: "skill.use", resource: skill.name, effect: "allow" },
    ],
    skills: [skillsPath],
    default_agent: applicationName,
    agents: {
      [applicationName]: {
        mode: "primary",
        description: agentDescription,
        system: role,
        permissions: [...(shell ? [] : ["shell"]), ...(web ? [] : ["webfetch", "websearch"])].map(
          (action) => rule(action, "deny"),
        ),
      },
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

/**
 * The whole config of the session: the Candidate's model, our limits, the skill and the agent.
 * The model keys are those of 1.x, which 2.x migrates itself.
 */
function opencodeConfigContent(
  host: AgentHost,
  {
    schema,
    profile,
    skillsPath,
  }: { schema: OpencodeConfigSchema; profile: LaunchProfile; skillsPath: string },
) {
  const own = schema === "2.x" ? configV2(profile, skillsPath) : configV1(profile, skillsPath);
  return JSON.stringify({ ...host.opencodeModel, ...own });
}

export function opencodeRecipe({
  host,
  profile,
  dataDirectory,
  sessionDirectory,
}: LaunchRequest): LaunchRecipe {
  const schema = opencodeConfigSchema(host.opencodeVersion);
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
      // Only 1.x reads this flag; 2.x gets the policies of `configV2` instead.
      ...(schema === "1.x" ? { OPENCODE_DISABLE_EXTERNAL_SKILLS: "1" } : {}),
      OPENCODE_DISABLE_PROJECT_CONFIG: "1",
      OPENCODE_CONFIG_CONTENT: opencodeConfigContent(host, { schema, profile, skillsPath }),
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
