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

/**
 * Keeps the tool calls the agent announced, by `toolCallId`, and answers permission requests for
 * our MCP tools by itself.
 */
function permissionGate(agent: AgentKind, request: SessionRequest): SessionRequest {
  const announced = new Map<string, ToolCallFields>();
  return {
    ...request,
    onUpdate: (update) => {
      const toolCall = announcedToolCall(update);
      if (toolCall !== null) {
        const earlier = announced.get(toolCall.toolCallId);
        announced.set(toolCall.toolCallId, { ...earlier, ...toolCall });
      }
      request.onUpdate(update);
    },
    onPermission: async (permission) => {
      const earlier = announced.get(permission.toolCall.toolCallId);
      const answer = automaticAnswer({
        agent,
        ourServer: request.mcpServer.name,
        toolCalls: earlier === undefined ? [permission.toolCall] : [permission.toolCall, earlier],
        options: permission.options,
      });
      return answer ?? request.onPermission(permission);
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
      return launch(
        launchRecipe(agent, installation, workingDirectory),
        permissionGate(agent, request),
      );
    },
  };
}
