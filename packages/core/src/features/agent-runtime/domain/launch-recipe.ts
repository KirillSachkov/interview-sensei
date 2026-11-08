// How each agent starts isolated from the Candidate's own instructions, skills and settings
// (#15, the isolation section of #17). Everything the start creates lives in the data directory;
// the Candidate's agent directories are only linked to, for the login.
import type { AgentHost, AgentKind } from "./agent.ts";

/** The session kinds this runtime knows; the agent-sessions slice passes its kind through. */
const runtimeSessionKinds = ["service-chat"] as const;
type RuntimeSessionKind = (typeof runtimeSessionKinds)[number];

export function isRuntimeSessionKind(value: string): value is RuntimeSessionKind {
  return runtimeSessionKinds.some((kind) => kind === value);
}

/** A file the server writes before the start; the path is inside the data directory. */
interface PreparedFile {
  readonly path: string;
  readonly content: string;
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
   * The permission mode the server sets with `session/set_mode` right after `session/new`, so the
   * Candidate's own mode never applies; null for an agent without modes.
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
}

export interface LaunchRequest {
  readonly agent: AgentKind;
  readonly sessionKind: RuntimeSessionKind;
  readonly host: AgentHost;
  readonly dataDirectory: string;
  /** The session's own directory inside the data directory: the agent's `cwd`. */
  readonly sessionDirectory: string;
}

/** Joins with `/`, which Node.js accepts on every platform; the domain uses no Node.js modules. */
function child(directory: string, ...names: string[]): string {
  return [directory.replace(/[/\\]+$/u, ""), ...names].join("/");
}

function required(program: string | null, name: string): string {
  if (program === null) {
    throw new Error(`The ${name} program is not installed`);
  }
  return program;
}

function claudeRecipe({ host, dataDirectory, sessionDirectory }: LaunchRequest): LaunchRecipe {
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
    sessionMeta: {
      claudeCode: {
        options: {
          settingSources: [],
          strictMcpConfig: true,
          skills: [],
          // The adapter reads `permissions.defaultMode` from the Candidate's settings by itself.
          allowDangerouslySkipPermissions: false,
          // Keeps transcripts out of `~/.claude/projects`; the server keeps its own journal.
          persistSession: false,
        },
      },
    },
    mode: "default",
    cwd: sessionDirectory,
    dataDirectory,
    directories: [sessionDirectory],
    files: [],
    symlinks: [],
  };
}

const codexModes: Readonly<Record<RuntimeSessionKind, string>> = {
  // The service chat changes no files.
  "service-chat": "read-only",
};

function codexRecipe({
  host,
  sessionKind,
  dataDirectory,
  sessionDirectory,
}: LaunchRequest): LaunchRecipe {
  const codexHome = child(dataDirectory, "agents", "codex", "codex-home");
  // Codex finds `~/.agents/skills` through the home directory, not through CODEX_HOME.
  const home = child(dataDirectory, "agents", "codex", "home");
  const mode = codexModes[sessionKind];
  return {
    command: host.nodeExecutable,
    args: [required(host.codexAdapter, "codex-acp")],
    env: { CODEX_HOME: codexHome, HOME: home, INITIAL_AGENT_MODE: mode },
    sessionMeta: null,
    mode,
    cwd: sessionDirectory,
    dataDirectory,
    directories: [codexHome, home, sessionDirectory],
    files: [
      {
        path: child(codexHome, "config.toml"),
        // No project AGENTS.md above `cwd` and no bundled skills.
        content: "project_doc_max_bytes = 0\n\n[skills.bundled]\nenabled = false\n",
      },
    ],
    symlinks: [{ path: child(codexHome, "auth.json"), target: host.codexAuth.path }],
  };
}

/** OpenCode has no permission modes; its config asks the Candidate before changes. */
const opencodeConfig = {
  // Neither the Candidate's OpenCode installation nor a shared link may change.
  autoupdate: false,
  share: "disabled",
  permission: { edit: "ask", bash: "ask", webfetch: "ask", external_directory: "ask" },
};

function opencodeRecipe({ host, dataDirectory, sessionDirectory }: LaunchRequest): LaunchRecipe {
  const root = child(dataDirectory, "agents", "opencode");
  const homes = {
    XDG_CONFIG_HOME: child(root, "config"),
    XDG_DATA_HOME: child(root, "data"),
    XDG_STATE_HOME: child(root, "state"),
    XDG_CACHE_HOME: child(root, "cache"),
  };
  const ownData = child(homes.XDG_DATA_HOME, "opencode");
  return {
    command: required(host.opencodeBinary, "opencode"),
    args: ["acp"],
    env: {
      ...homes,
      OPENCODE_DISABLE_CLAUDE_CODE: "1",
      OPENCODE_DISABLE_EXTERNAL_SKILLS: "1",
      OPENCODE_DISABLE_PROJECT_CONFIG: "1",
      OPENCODE_CONFIG_CONTENT: JSON.stringify(opencodeConfig),
    },
    sessionMeta: null,
    mode: null,
    cwd: sessionDirectory,
    dataDirectory,
    directories: [
      homes.XDG_CONFIG_HOME,
      ownData,
      homes.XDG_STATE_HOME,
      homes.XDG_CACHE_HOME,
      sessionDirectory,
    ],
    files: [],
    // A link to a missing file would make OpenCode create the Candidate's file on login.
    symlinks: host.opencodeAuth.exists
      ? [{ path: child(ownData, "auth.json"), target: host.opencodeAuth.path }]
      : [],
  };
}

/** Turns the agent and session kind into the isolated start of the agent; a pure function. */
export function launchRecipe(request: LaunchRequest): LaunchRecipe {
  switch (request.agent) {
    case "claude": {
      return claudeRecipe(request);
    }
    case "codex": {
      return codexRecipe(request);
    }
    case "opencode": {
      return opencodeRecipe(request);
    }
    case "fake": {
      return {
        command: request.host.nodeExecutable,
        args: [request.host.fakeAgentScript],
        env: {},
        sessionMeta: null,
        mode: null,
        cwd: request.sessionDirectory,
        dataDirectory: request.dataDirectory,
        directories: [request.sessionDirectory],
        files: [],
        symlinks: [],
      };
    }
    default: {
      return request.agent satisfies never;
    }
  }
}

/**
 * Variables of the Candidate's environment that would point an agent at the Candidate's own
 * config instead of the recipe's, or tell it about this server. API keys stay: the Candidate
 * chose them. With `ANTHROPIC_API_KEY` set, Claude Code bills the API instead of the subscription.
 */
const isolationBreakers = new Set([
  "OPENCODE_CONFIG",
  "OPENCODE_CONFIG_DIR",
  "CLAUDE_CONFIG_DIR",
  "CODEX_HOME",
]);
const ownPrefix = "INTERVIEW_SENSEI_";

/** The agent's environment: the Candidate's without the isolation breakers, then the recipe's. */
export function agentEnvironment(
  candidate: Readonly<Record<string, string | undefined>>,
  recipe: Readonly<Record<string, string>>,
): Record<string, string> {
  const kept = Object.entries(candidate).filter(
    (entry): entry is [string, string] =>
      entry[1] !== undefined && !isolationBreakers.has(entry[0]) && !entry[0].startsWith(ownPrefix),
  );
  return { ...Object.fromEntries(kept), ...recipe };
}
