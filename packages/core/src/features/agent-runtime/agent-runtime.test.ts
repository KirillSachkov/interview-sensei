// Unit tests of how the runtime keeps announced tool calls for its automatic permission answers.
// The launcher is an in-memory stand-in for the ACP port: the test plays the agent's side.
import { describe, expect, it } from "vitest";

import { createAgentRuntime } from "./application/agent-runtime.ts";
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

/** Starts the fake agent through an in-memory launcher and returns the agent's side of ACP. */
async function startAgent() {
  const launched = Promise.withResolvers<SessionRequest>();
  const turn = Promise.withResolvers<{ type: "ended"; stopReason: string }>();
  const runtime = createAgentRuntime({
    agents: ["fake"],
    installation: { nodeExecutable: "node", fakeAgentScript: "fake-agent.ts" },
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
