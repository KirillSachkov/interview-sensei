// Claude Code through `claude-agent-acp`: isolation by Agent SDK options in `_meta`, the role as
// an appended ACP system prompt, the skill as a local plugin.
import { child, ourName, required, skillCopy } from "./recipe.ts";
import type { LaunchProfile, LaunchRecipe, LaunchRequest } from "./recipe.ts";

/** Claude Code's own tools for shell commands and for the web. */
const claudeShellTools = ["Bash"];
const claudeWebTools = ["WebFetch", "WebSearch"];

/** The Agent SDK options of the session: isolation, the plugin with the skill and the bans. */
function claudeOptions(profile: LaunchProfile, plugin: string) {
  return {
    settingSources: [],
    strictMcpConfig: true,
    plugins: [{ type: "local", path: plugin }],
    // Plugin skills are named `plugin:skill`; the list hides every other skill.
    skills: [`${ourName}:${profile.skill.name}`],
    // Removes the tools from the model's context in every permission mode.
    disallowedTools: [
      ...(profile.shell ? [] : claudeShellTools),
      ...(profile.web ? [] : claudeWebTools),
    ],
    // The adapter reads `permissions.defaultMode` from the Candidate's settings by itself.
    allowDangerouslySkipPermissions: false,
    // Keeps transcripts out of `~/.claude/projects`; the server keeps its own journal.
    persistSession: false,
  };
}

export function claudeRecipe({
  host,
  profile,
  dataDirectory,
  sessionDirectory,
}: LaunchRequest): LaunchRecipe {
  // A local plugin: Claude Code finds its skills without an installation in the Candidate's home.
  const plugin = child(dataDirectory, "agents", "claude", "skills", profile.skill.name);
  const skill = skillCopy(child(plugin, "skills", profile.skill.name), profile.skill);
  const manifest = child(plugin, ".claude-plugin");
  return {
    command: host.nodeExecutable,
    args: [required(host.claudeAdapter, "claude-agent-acp")],
    // The configuration directory stays the Candidate's: Claude Code ties the Keychain login to it.
    env: {
      CLAUDE_CODE_DISABLE_AUTO_MEMORY: "1",
      ENABLE_CLAUDEAI_MCP_SERVERS: "false",
      CLAUDE_CODE_DISABLE_BUNDLED_SKILLS: "1",
      // The bundled CLI must not update the Candidate's own installation.
      DISABLE_AUTOUPDATER: "1",
    },
    sessionMeta: { claudeCode: { options: claudeOptions(profile, plugin) } },
    systemPrompt: profile.role,
    additionalDirectories: [],
    mode: "default",
    cwd: sessionDirectory,
    dataDirectory,
    directories: [manifest, ...skill.directories, sessionDirectory],
    files: [
      { path: child(manifest, "plugin.json"), content: `${JSON.stringify({ name: ourName })}\n` },
      ...skill.files,
    ],
    symlinks: [],
  };
}
