import type { OpencodeModelSettings } from "./opencode-settings.ts";

/** The agents the server can start; `fake` only for tests and manual checks. */
export const agentKinds = ["claude", "codex", "opencode", "fake"] as const;
export type AgentKind = (typeof agentKinds)[number];

export function isAgentKind(value: string): value is AgentKind {
  return agentKinds.some((kind) => kind === value);
}

/** Whether the Candidate can choose the agent now; `reason` says why not and what to do. */
export type AgentAvailability =
  | { readonly agent: AgentKind; readonly available: true }
  | { readonly agent: AgentKind; readonly available: false; readonly reason: string };

/** A file of the Candidate's own agent setup that the server only checks and links to. */
interface UserFile {
  readonly path: string;
  readonly exists: boolean;
}

/**
 * What the server found on this machine for the agents. The server reads the Candidate's agent
 * directories only to fill it in and never writes there.
 */
export interface AgentHost {
  /** The Node.js executable that runs the server and the adapters. */
  readonly nodeExecutable: string;
  /** The fake ACP agent for tests and manual checks without a subscription. */
  readonly fakeAgentScript: string;
  /** The entry script of `@agentclientprotocol/claude-agent-acp`, or null when it is missing. */
  readonly claudeAdapter: string | null;
  /** The entry script of `@agentclientprotocol/codex-acp`, or null when it is missing. */
  readonly codexAdapter: string | null;
  /** `opencode` found in PATH, or null. */
  readonly opencodeBinary: string | null;
  /** What `opencode --version` printed, or null when it failed; see `opencodeConfigSchema`. */
  readonly opencodeVersion: string | null;
  /** The Candidate's Codex login: `auth.json` in `$CODEX_HOME` or `~/.codex`. */
  readonly codexAuth: UserFile;
  /** The Candidate's OpenCode provider keys: `opencode/auth.json` in `$XDG_DATA_HOME`. */
  readonly opencodeAuth: UserFile;
  /** The model the Candidate chose for OpenCode; see `opencodeModelSettings`. */
  readonly opencodeModel: OpencodeModelSettings;
}

/** Why an adapter that comes with the application is missing, and what to do. */
function adapterMissing(agentName: string): string {
  return `Адаптер ${agentName} не установлен вместе с приложением. Выполните \`pnpm install\` и перезапустите приложение.`;
}

function availabilityOf(agent: AgentKind, host: AgentHost): AgentAvailability {
  const unavailable = (reason: string): AgentAvailability => ({ agent, available: false, reason });
  switch (agent) {
    case "claude": {
      return host.claudeAdapter === null
        ? unavailable(adapterMissing("Claude Code"))
        : { agent, available: true };
    }
    case "codex": {
      if (host.codexAdapter === null) {
        return unavailable(adapterMissing("Codex"));
      }
      return host.codexAuth.exists
        ? { agent, available: true }
        : unavailable(
            `Нет входа в Codex: не найден ${host.codexAuth.path}. Выполните \`codex login\` и обновите страницу.`,
          );
    }
    case "opencode": {
      return host.opencodeBinary === null
        ? unavailable(
            "OpenCode не установлен: команда `opencode` не найдена в PATH. Установите OpenCode и перезапустите приложение.",
          )
        : { agent, available: true };
    }
    case "fake": {
      return { agent, available: true };
    }
    default: {
      return agent satisfies never;
    }
  }
}

/** The availability of each offered agent, in the order given. */
export function agentAvailability(
  agents: readonly AgentKind[],
  host: AgentHost,
): AgentAvailability[] {
  return agents.map((agent) => availabilityOf(agent, host));
}
