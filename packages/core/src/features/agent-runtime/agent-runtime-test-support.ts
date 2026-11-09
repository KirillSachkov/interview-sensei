// The runtime with an in-memory launcher for its unit tests: a made-up machine, skills and
// OpenCode credentials; nothing starts an agent or reads a database.
import { createAgentRuntime } from "./application/agent-runtime.ts";
import type { AgentHost } from "./domain/agent.ts";
import type { OpencodeCredentialRow } from "./domain/opencode-credentials.ts";
import type { LaunchRecipe, SkillSource } from "./domain/launch-recipe.ts";
import type { PermissionAnswer } from "./domain/ports.ts";

export const ourServer = "interview-sensei-1a2b3c4d";

export const candidateAnswer: PermissionAnswer = { outcome: "selected", optionId: "reject-once" };

/** A machine with every agent installed and no Codex login. */
export const host: AgentHost = {
  nodeExecutable: "node",
  fakeAgentScript: "fake-agent.ts",
  claudeAdapter: "claude-agent-acp.js",
  codexAdapter: "codex-acp.js",
  opencodeBinary: null,
  opencodeVersion: null,
  codexAuth: { path: "/home/candidate/.codex/auth.json", exists: false },
  opencodeAuth: { path: "/home/candidate/.local/share/opencode/auth.json", exists: false },
  opencodeDatabase: null,
  opencodeModel: {},
};

/** A skill reader that makes up the skill's one file and keeps the names it was asked for. */
export function skillReader() {
  const read: string[] = [];
  const readSkill = (name: string): Promise<SkillSource> => {
    read.push(name);
    return Promise.resolve({ name, files: [{ path: "SKILL.md", content: `# ${name}\n` }] });
  };
  return { read, readSkill };
}

/** The Candidate's OpenCode 2.x API keys of two providers. */
export const apiKeyCredentials: readonly OpencodeCredentialRow[] = [
  {
    id: "cred_1",
    integration: "deepseek",
    value: '{"type":"key","key":"sk-deepseek"}',
    active: null,
    created: 1,
  },
  {
    id: "cred_2",
    integration: "minimax",
    value: '{"type":"key","key":"sk-minimax"}',
    active: null,
    created: 1,
  },
];

/** A runtime offering the agents; `recipes` collects what it hands the launcher. */
export function runtimeOffering(
  agents: Parameters<typeof createAgentRuntime>[0]["agents"],
  machine: AgentHost = host,
  credentials: readonly OpencodeCredentialRow[] = apiKeyCredentials,
) {
  const recipes: LaunchRecipe[] = [];
  const { read, readSkill } = skillReader();
  /** The databases the runtime read the OpenCode 2.x credentials from. */
  const databases: string[] = [];
  const warnings: string[] = [];
  const runtime = createAgentRuntime({
    agents,
    inspectHost: () => Promise.resolve(machine),
    readOpencodeCredentials: (database) => {
      databases.push(database);
      return Promise.resolve(credentials);
    },
    onWarning: (message) => {
      warnings.push(message);
    },
    dataDirectory: "/home/candidate/.interview-sensei",
    readSkill,
    launch: (recipe) => {
      recipes.push(recipe);
      return Promise.resolve({
        acpSessionId: "acp-1",
        prompt: () => Promise.resolve({ type: "ended", stopReason: "end_turn" }),
        cancel: async () => {},
        stop: async () => {},
      });
    },
  });
  const start = async (agent: string) =>
    runtime.start({
      agent,
      kind: "service-chat",
      workingDirectory: "/home/candidate/.interview-sensei/sessions/1",
      mcpServer: { name: ourServer, url: "http://127.0.0.1:1/mcp" },
      onUpdate: () => {},
      onExit: () => {},
      onPermission: () => Promise.resolve(candidateAnswer),
    });
  return { runtime, start, recipes, read, databases, warnings };
}
