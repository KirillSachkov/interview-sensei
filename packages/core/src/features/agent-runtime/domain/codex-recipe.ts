// Codex through `codex-acp`: its own homes in the data directory, the role as an appended ACP
// system prompt, the skill in `.agents/skills` of an additional directory, bans in CODEX_CONFIG.
import { agentsSkillsRoot, child, required } from "./recipe.ts";
import type { LaunchProfile, LaunchRecipe, LaunchRequest } from "./recipe.ts";

/**
 * The Codex config over the session's, for the whole adapter process; each session has its own
 * process. Null when the profile forbids nothing.
 */
function codexBans({ shell, web }: LaunchProfile): string | null {
  const config = {
    ...(shell ? {} : { features: { shell_tool: false } }),
    ...(web ? {} : { web_search: "disabled" }),
  };
  return Object.keys(config).length === 0 ? null : JSON.stringify(config);
}

/** Codex sessions change no files; Codex has no mode between read-only and writes. */
const codexMode = "read-only";

export function codexRecipe({
  host,
  profile,
  dataDirectory,
  sessionDirectory,
}: LaunchRequest): LaunchRecipe {
  const codexHome = child(dataDirectory, "agents", "codex", "codex-home");
  // Codex finds `~/.agents/skills` through the home directory, not through CODEX_HOME.
  const home = child(dataDirectory, "agents", "codex", "home");
  const skill = agentsSkillsRoot(dataDirectory, "codex", profile.skill);
  const bans = codexBans(profile);
  return {
    command: host.nodeExecutable,
    args: [required(host.codexAdapter, "codex-acp")],
    env: {
      CODEX_HOME: codexHome,
      HOME: home,
      INITIAL_AGENT_MODE: codexMode,
      ...(bans === null ? {} : { CODEX_CONFIG: bans }),
    },
    sessionMeta: null,
    systemPrompt: profile.role,
    additionalDirectories: [skill.root],
    mode: codexMode,
    cwd: sessionDirectory,
    dataDirectory,
    directories: [codexHome, home, ...skill.directories, sessionDirectory],
    files: [
      {
        path: child(codexHome, "config.toml"),
        // No project AGENTS.md above `cwd` and no bundled skills.
        content: "project_doc_max_bytes = 0\n\n[skills.bundled]\nenabled = false\n",
      },
      ...skill.files,
    ],
    symlinks: [{ path: child(codexHome, "auth.json"), target: host.codexAuth.path }],
  };
}
