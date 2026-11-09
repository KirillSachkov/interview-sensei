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

/**
 * The read-only sandbox tells the model that it cannot write, so it refuses without a try. Yet
 * with the mode's `on-request` approvals, Codex asks the Candidate before apply_patch writes.
 */
const writeApproval =
  "File changes: the sandbox is read-only, and apply_patch asks the Candidate's approval before " +
  "it writes. To change a file, call apply_patch; do not refuse because the sandbox is read-only.";

/**
 * The role, then the skill's SKILL.md when shell is off: Codex lists the skill but reads its file
 * only through shell. Then how file changes reach the Candidate.
 */
function codexSystemPrompt({ role, shell, skill }: LaunchProfile): string {
  const main = skill.files.find((file) => file.path === "SKILL.md");
  const skillText =
    shell || main === undefined
      ? []
      : [
          `No tool in this session reads files, so the SKILL.md of the ${skill.name} skill ` +
            "follows; treat it as read.",
          `<skill name="${skill.name}">\n${main.content}</skill>`,
        ];
  return [role, ...skillText, writeApproval].join("\n\n");
}

/**
 * No AGENTS.md above `cwd`, no bundled skills, and none of the ChatGPT apps and plugins of the
 * Candidate's account: they bring their own tools and skills.
 */
const codexConfigToml =
  "project_doc_max_bytes = 0\n\n[features]\napps = false\nplugins = false\n\n" +
  "[skills.bundled]\nenabled = false\n";

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
    systemPrompt: codexSystemPrompt(profile),
    additionalDirectories: [skill.root],
    mode: codexMode,
    cwd: sessionDirectory,
    dataDirectory,
    directories: [codexHome, home, ...skill.directories, sessionDirectory],
    files: [
      {
        path: child(codexHome, "config.toml"),
        content: codexConfigToml,
      },
      ...skill.files,
    ],
    symlinks: [{ path: child(codexHome, "auth.json"), target: host.codexAuth.path }],
    syncedDirectories: [skill.directory],
  };
}
