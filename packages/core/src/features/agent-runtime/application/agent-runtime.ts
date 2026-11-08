import type { AgentAvailability, AgentKind, Installation } from "../domain/agent.ts";
import { isAgentKind, launchRecipe } from "../domain/agent.ts";
import { automaticAnswer } from "../domain/permissions.ts";
import type {
  AcpLauncher,
  AgentUpdate,
  LiveAgent,
  SessionRequest,
  ToolCallFields,
} from "../domain/ports.ts";

export interface AgentRuntimeDependencies {
  /** The agents this server offers; the fake agent only when the server enables it. */
  readonly agents: readonly AgentKind[];
  readonly installation: Installation;
  readonly launch: AcpLauncher;
}

/** Checks which agents are available, starts them through ACP and passes on their events. */
export interface AgentRuntime {
  readonly listAgents: () => readonly AgentAvailability[];
  /**
   * Starts the agent with our MCP server. The server allows calls of our MCP tools by itself;
   * other permission requests go to `onPermission`.
   */
  readonly start: (
    request: SessionRequest & { agent: string; workingDirectory: string },
  ) => Promise<LiveAgent>;
}

function announcedToolCall(update: AgentUpdate): ToolCallFields | null {
  const { sessionUpdate, toolCallId } = update;
  return (sessionUpdate === "tool_call" || sessionUpdate === "tool_call_update") &&
    typeof toolCallId === "string"
    ? { ...update, toolCallId }
    : null;
}

/** A tool call in these states asks no more permissions. */
const finishedStatuses = new Set(["completed", "failed"]);

/**
 * Keeps the tool calls the agent announced in the current turn, by `toolCallId`, and answers
 * permission requests for our MCP tools by itself. A finished tool call and the end of the turn
 * remove the kept tool calls.
 */
function permissionGate(
  agent: AgentKind,
  request: SessionRequest,
): { session: SessionRequest; endTurn: () => void } {
  const announced = new Map<string, ToolCallFields>();
  const session: SessionRequest = {
    ...request,
    onUpdate: (update) => {
      const toolCall = announcedToolCall(update);
      if (toolCall !== null) {
        if (typeof toolCall.status === "string" && finishedStatuses.has(toolCall.status)) {
          announced.delete(toolCall.toolCallId);
        } else {
          const earlier = announced.get(toolCall.toolCallId);
          announced.set(toolCall.toolCallId, { ...earlier, ...toolCall });
        }
      }
      request.onUpdate(update);
    },
    onPermission: async (permission) => {
      const earlier = announced.get(permission.toolCall.toolCallId);
      const answer = automaticAnswer({
        agent,
        ourServer: request.mcpServer.name,
        request: permission.toolCall,
        announced: earlier,
        options: permission.options,
      });
      // The Candidate sees the announced tool call too: the request may carry only its id.
      return (
        answer ??
        request.onPermission({ ...permission, toolCall: { ...earlier, ...permission.toolCall } })
      );
    },
  };
  return {
    session,
    endTurn: () => {
      announced.clear();
    },
  };
}

/** The agent whose turns, however they end, forget the tool calls announced in them. */
function forgettingTurns(agent: LiveAgent, endTurn: () => void): LiveAgent {
  return {
    ...agent,
    prompt: async (text) => {
      try {
        return await agent.prompt(text);
      } finally {
        endTurn();
      }
    },
  };
}

export function createAgentRuntime({
  agents,
  installation,
  launch,
}: AgentRuntimeDependencies): AgentRuntime {
  return {
    listAgents: () => agents.map((agent) => ({ agent, available: true })),
    start: async ({ agent, workingDirectory, ...request }) => {
      if (!isAgentKind(agent) || !agents.includes(agent)) {
        throw new Error(`The agent ${agent} is not available`);
      }
      const gate = permissionGate(agent, request);
      const live = await launch(launchRecipe(agent, installation, workingDirectory), gate.session);
      return forgettingTurns(live, gate.endTurn);
    },
  };
}
