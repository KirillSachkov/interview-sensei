// Unit tests of how the runtime keeps announced tool calls for its automatic permission answers.
// The launcher is an in-memory stand-in for the ACP port: the test plays the agent's side.
import { describe, expect, it } from "vitest";

import { sessionProfiles } from "../../shared/session-kinds/index.ts";
import { createAgentRuntime } from "./application/agent-runtime.ts";
import type { AgentHost } from "./domain/agent.ts";
import type { LaunchRecipe, SkillSource } from "./domain/launch-recipe.ts";
import type {
  AgentUpdate,
  PermissionAnswer,
  PermissionOption,
  SessionRequest,
} from "./domain/ports.ts";

const ourServer = "interview-sensei-1a2b3c4d";

const options: PermissionOption[] = [
  { optionId: "allow-once", name: "Разрешить", kind: "allow_once" },
  { optionId: "reject-once", name: "Отклонить", kind: "reject_once" },
];

const candidateAnswer: PermissionAnswer = { outcome: "selected", optionId: "reject-once" };
const automaticAllow: PermissionAnswer = { outcome: "selected", optionId: "allow-once" };

/** Our MCP tool call as the fake agent announces it. */
const ourToolCall: AgentUpdate = {
  sessionUpdate: "tool_call",
  toolCallId: "call-1",
  title: "get_brief",
  kind: "other",
  status: "pending",
  _meta: { fakeAgent: { mcpServer: ourServer } },
};

/** A machine with every agent installed and no Codex login. */
const host: AgentHost = {
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
function skillReader() {
  const read: string[] = [];
  const readSkill = (name: string): Promise<SkillSource> => {
    read.push(name);
    return Promise.resolve({ name, files: [{ path: "SKILL.md", content: `# ${name}\n` }] });
  };
  return { read, readSkill };
}

/** Starts the fake agent through an in-memory launcher and returns the agent's side of ACP. */
async function startAgent() {
  const launched = Promise.withResolvers<SessionRequest>();
  const turn = Promise.withResolvers<{ type: "ended"; stopReason: string }>();
  const runtime = createAgentRuntime({
    agents: ["fake"],
    inspectHost: () => Promise.resolve(host),
    readOpencodeCredentials: () => Promise.resolve([]),
    dataDirectory: "/home/candidate/.interview-sensei",
    readSkill: skillReader().readSkill,
    launch: (_recipe, session) => {
      launched.resolve(session);
      return Promise.resolve({
        acpSessionId: "acp-1",
        prompt: async () => turn.promise,
        cancel: async () => {},
        stop: async () => {},
      });
    },
  });
  const live = await runtime.start({
    agent: "fake",
    kind: "service-chat",
    workingDirectory: "/tmp/session",
    mcpServer: { name: ourServer, url: "http://127.0.0.1:1/mcp" },
    onUpdate: () => {},
    onExit: () => {},
    onPermission: () => Promise.resolve(candidateAnswer),
  });
  const session = await launched.promise;
  return {
    announce: (update: AgentUpdate) => {
      session.onUpdate(update);
    },
    /** Asks permission with only the tool call id, like an adapter. */
    ask: async (toolCallId: string) => session.onPermission({ toolCall: { toolCallId }, options }),
    /** Runs one turn that ends when `endTurn` is called. */
    prompt: async () => live.prompt("/brief"),
    endTurn: () => {
      turn.resolve({ type: "ended", stopReason: "end_turn" });
    },
  };
}

describe("agent runtime permission gate", () => {
  it("allows a request for our announced tool call by itself", async () => {
    const agent = await startAgent();
    const turn = agent.prompt();
    agent.announce(ourToolCall);

    await expect(agent.ask("call-1")).resolves.toStrictEqual(automaticAllow);
    agent.endTurn();
    await turn;
  });

  it("leaves to the Candidate a request that reuses the id of a completed tool call", async () => {
    const agent = await startAgent();
    const turn = agent.prompt();
    agent.announce(ourToolCall);
    agent.announce({
      sessionUpdate: "tool_call_update",
      toolCallId: "call-1",
      status: "completed",
    });

    await expect(agent.ask("call-1")).resolves.toStrictEqual(candidateAnswer);
    agent.endTurn();
    await turn;
  });

  it("leaves to the Candidate a request that reuses a tool call id after the turn ends", async () => {
    const agent = await startAgent();
    const turn = agent.prompt();
    agent.announce(ourToolCall);
    agent.endTurn();
    await turn;

    await expect(agent.ask("call-1")).resolves.toStrictEqual(candidateAnswer);
  });
});

/** A runtime offering the agents; `recipes` collects what it hands the launcher. */
function runtimeOffering(
  agents: Parameters<typeof createAgentRuntime>[0]["agents"],
  machine: AgentHost = host,
) {
  const recipes: LaunchRecipe[] = [];
  const { read, readSkill } = skillReader();
  /** The databases the runtime read the OpenCode 2.x credentials from. */
  const databases: string[] = [];
  const runtime = createAgentRuntime({
    agents,
    inspectHost: () => Promise.resolve(machine),
    readOpencodeCredentials: (database) => {
      databases.push(database);
      return Promise.resolve([
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
      ]);
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
  return { runtime, start, recipes, read, databases };
}

describe("agent runtime start", () => {
  it("lists the offered agents with the reason of each unavailable one", async () => {
    const { runtime } = runtimeOffering(["claude", "codex", "opencode"]);

    const [claude, codex, opencode] = await runtime.listAgents();

    expect(claude).toStrictEqual({ agent: "claude", available: true });
    expect(codex).toMatchObject({ agent: "codex", available: false });
    expect(opencode).toMatchObject({ agent: "opencode", available: false });
  });

  it("starts an available agent by its recipe", async () => {
    const { start, recipes } = runtimeOffering(["claude"]);

    await start("claude");

    expect(recipes).toMatchObject([{ args: ["claude-agent-acp.js"], mode: "default" }]);
  });

  it("starts the agent with the role and the freshly read skill of the session kind's profile", async () => {
    const { start, recipes, read } = runtimeOffering(["claude"]);

    await start("claude");

    expect(read).toStrictEqual(["sensei-check"]);
    expect(recipes).toMatchObject([
      {
        systemPrompt: sessionProfiles["service-chat"].role,
        sessionMeta: { claudeCode: { options: { skills: ["interview-sensei:sensei-check"] } } },
      },
    ]);
  });

  it("refuses to start an unavailable agent and gives the reason", async () => {
    const { start, recipes } = runtimeOffering(["codex"]);

    await expect(start("codex")).rejects.toThrow(/codex login/u);
    expect(recipes).toStrictEqual([]);
  });

  it("refuses to start an agent the server does not offer", async () => {
    const { start } = runtimeOffering(["claude"]);

    await expect(start("fake")).rejects.toThrow(/not offered/u);
  });

  it("refuses to start a session kind that has no profile", async () => {
    const { runtime, recipes } = runtimeOffering(["claude"]);

    await expect(
      runtime.start({
        agent: "claude",
        kind: "unknown",
        workingDirectory: "/home/candidate/.interview-sensei/sessions/1",
        mcpServer: { name: ourServer, url: "http://127.0.0.1:1/mcp" },
        onUpdate: () => {},
        onExit: () => {},
        onPermission: () => Promise.resolve(candidateAnswer),
      }),
    ).rejects.toThrow(/no profile/u);
    expect(recipes).toStrictEqual([]);
  });
});

describe("agent runtime with the Candidate's OpenCode 2.x keys", () => {
  const database = "/home/candidate/.local/share/opencode/opencode.db";
  const opencode: AgentHost = {
    ...host,
    opencodeBinary: "/opt/homebrew/bin/opencode",
    opencodeVersion: "opencode v2.2.6",
    opencodeDatabase: database,
    opencodeModel: { model: "deepseek/deepseek-flash" },
  };

  it("never reads the OpenCode database to list the agents", async () => {
    const { runtime, databases } = runtimeOffering(["opencode"], opencode);

    await runtime.listAgents();

    expect(databases).toStrictEqual([]);
  });

  it("reads it at the start of an OpenCode 2.x session and passes the keys of its models only", async () => {
    const { start, recipes, databases } = runtimeOffering(["opencode"], opencode);

    await start("opencode");

    expect(databases).toStrictEqual([database]);
    expect(recipes[0]?.env).toMatchObject({ INTERVIEW_SENSEI_OPENCODE_KEY_1: "sk-deepseek" });
    expect(JSON.stringify(recipes[0]?.env)).not.toContain("sk-minimax");
  });

  it("never reads it for OpenCode 1.x, which reads the linked auth.json", async () => {
    const { start, databases } = runtimeOffering(["opencode"], {
      ...opencode,
      opencodeVersion: "1.18.30",
    });

    await start("opencode");

    expect(databases).toStrictEqual([]);
  });
});
