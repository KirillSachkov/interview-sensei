// The parts every launch recipe shares: what a recipe is, the profile it translates and the
// helpers that put files into the data directory. The domain uses no Node.js modules.
import type { AgentHost, AgentKind } from "./agent.ts";

/** A file the server writes before the start; the path is inside the data directory. */
interface PreparedFile {
  readonly path: string;
  readonly content: string;
}

/** One file of a skill; `path` is relative to the skill's directory and uses `/`. */
interface SkillFile {
  readonly path: string;
  readonly content: string;
}

/** A skill of the application, read from its `skills/` directory before the start. */
export interface SkillSource {
  /** The skill's directory name, equal to the `name` in its SKILL.md. */
  readonly name: string;
  /** Every file of the skill, SKILL.md included. */
  readonly files: readonly SkillFile[];
}

/** What the session kind asks of the agent; each recipe translates it for its agent. */
export interface LaunchProfile {
  /** Added to the agent's system prompt; in English. */
  readonly role: string;
  /** The only skill the agent sees. */
  readonly skill: SkillSource;
  /** Whether the agent may run shell commands. */
  readonly shell: boolean;
  /** Whether the agent may fetch web pages and search the web. */
  readonly web: boolean;
}

/** A link inside the data directory to a file of the Candidate's own agent setup. */
interface PreparedSymlink {
  readonly path: string;
  readonly target: string;
}

/** How to start one agent process for one session. */
export interface LaunchRecipe {
  readonly command: string;
  readonly args: readonly string[];
  /** Variables put over the Candidate's environment; see `agentEnvironment`. */
  readonly env: Readonly<Record<string, string>>;
  /** `_meta` of `session/new`, or null. */
  readonly sessionMeta: Readonly<Record<string, unknown>> | null;
  /**
   * The ACP `systemPrompt` of `session/new` in the `append` mode; null for an agent that gets the
   * role another way. An agent without the capability does not start.
   */
  readonly systemPrompt: string | null;
  /** The ACP `additionalDirectories` of `session/new`, inside the data directory. */
  readonly additionalDirectories: readonly string[];
  /**
   * The mode the server sets with `session/set_mode` right after `session/new`, so the
   * Candidate's own mode never applies; null for an agent without modes. For OpenCode it selects
   * the recipe's own agent.
   */
  readonly mode: string | null;
  /** The session directory inside the data directory. */
  readonly cwd: string;
  /** The data directory; every directory, file and link below lies inside it. */
  readonly dataDirectory: string;
  /** Directories to create before the start, `cwd` included. */
  readonly directories: readonly string[];
  readonly files: readonly PreparedFile[];
  /** Links to the Candidate's login files; a copy would go stale when the agent refreshes it. */
  readonly symlinks: readonly PreparedSymlink[];
  /**
   * Directories that hold only the recipe's copy, such as the skill's: the start removes every
   * other file and directory in them, so the copy equals its source.
   */
  readonly syncedDirectories: readonly string[];
}

export interface LaunchRequest {
  readonly agent: AgentKind;
  readonly profile: LaunchProfile;
  readonly host: AgentHost;
  readonly dataDirectory: string;
  /** The session's own directory inside the data directory: the agent's `cwd`. */
  readonly sessionDirectory: string;
}

/** Joins with `/`, which Node.js accepts on every platform; the domain uses no Node.js modules. */
export function child(directory: string, ...names: string[]): string {
  return [directory.replace(/[/\\]+$/u, ""), ...names].join("/");
}

export function required(program: string | null, name: string): string {
  if (program === null) {
    throw new Error(`The ${name} program is not installed`);
  }
  return program;
}

/** The parent of a path joined with `/`. */
function parent(location: string): string {
  return location.slice(0, location.lastIndexOf("/"));
}

/**
 * The files of the skill under `directory`, and the directories they need, parents first. The
 * copy is rewritten at each start and `directory` is synced, so the next session gets the skill
 * as it is now.
 */
export function skillCopy(
  directory: string,
  skill: SkillSource,
): { directory: string; directories: string[]; files: PreparedFile[] } {
  const files = skill.files.map((file) => ({
    path: child(directory, ...file.path.split("/")),
    content: file.content,
  }));
  const directories = [...new Set([directory, ...files.map((file) => parent(file.path))])];
  return { directory, directories: directories.toSorted(), files };
}

/** Our skills' namespace: the Claude Code plugin name and the OpenCode agent name. */
export const applicationName = "interview-sensei";

/**
 * A directory whose `.agents/skills` holds only the profile's skill; Codex and the fake agent
 * take skill roots from ACP `additionalDirectories` this way.
 */
export function agentsSkillsRoot(dataDirectory: string, agent: AgentKind, skill: SkillSource) {
  const root = child(dataDirectory, "agents", agent, "skills", skill.name);
  return { root, ...skillCopy(child(root, ".agents", "skills", skill.name), skill) };
}
