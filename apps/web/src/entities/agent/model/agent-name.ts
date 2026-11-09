const agentNames: Readonly<Record<string, string>> = {
  claude: "Claude Code",
  codex: "Codex",
  opencode: "OpenCode",
  fake: "Фейковый агент",
};

/** The agent's name for the Candidate. */
export function agentName(agent: string): string {
  return agentNames[agent] ?? agent;
}
