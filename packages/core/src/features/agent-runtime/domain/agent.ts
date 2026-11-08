/** The agents the server can start. #24 adds Claude Code, Codex and OpenCode. */
export const agentKinds = ["fake"] as const;
export type AgentKind = (typeof agentKinds)[number];

export function isAgentKind(value: string): value is AgentKind {
  return agentKinds.some((kind) => kind === value);
}

/** Whether the Candidate can choose the agent now. */
export interface AgentAvailability {
  readonly agent: AgentKind;
  readonly available: boolean;
}

/** Where the programs that the recipes start live on this machine. */
export interface Installation {
  /** The Node.js executable that runs the server. */
  readonly nodeExecutable: string;
  /** The fake ACP agent for tests and manual checks without a subscription. */
  readonly fakeAgentScript: string;
}

/** How to start one agent process for one session. */
export interface LaunchRecipe {
  readonly command: string;
  readonly args: readonly string[];
  /** Variables added to the server's environment. */
  readonly env: Readonly<Record<string, string>>;
  /** The session directory inside the data directory. */
  readonly cwd: string;
}

/** Turns the agent and its session directory into the command that starts it. */
export function launchRecipe(
  agent: AgentKind,
  installation: Installation,
  sessionDirectory: string,
): LaunchRecipe {
  switch (agent) {
    case "fake": {
      return {
        command: installation.nodeExecutable,
        args: [installation.fakeAgentScript],
        env: {},
        cwd: sessionDirectory,
      };
    }
    default: {
      return agent satisfies never;
    }
  }
}
