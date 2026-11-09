import { sessionKinds } from "../../../shared/session-kinds/index.ts";
import type { AgentAvailability, AgentHost, AgentKind } from "../domain/agent.ts";
import { agentAvailability, isAgentKind } from "../domain/agent.ts";
import { launchRecipe } from "../domain/launch-recipe.ts";
import type { RuntimeSessionKind } from "../domain/launch-recipe.ts";
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
  /**
   * Finds the adapters, programs and logins on this machine. The runtime asks at each check, so a
   * new login shows after a page reload.
   */
  readonly inspectHost: () => Promise<AgentHost>;
  /** The data directory: the agents' own homes and configs live in it. */
  readonly dataDirectory: string;
  readonly launch: AcpLauncher;
}

/** Checks which agents are available, starts them through ACP and passes on their events. */
export interface AgentRuntime {
  readonly listAgents: () => Promise<readonly AgentAvailability[]>;
  /**
   * Starts the agent with our MCP server. The server allows calls of our MCP tools by itself;
   * other permission requests go to `onPermission`.
   */
  readonly start: (
    request: SessionRequest & { agent: string; kind: string; workingDirectory: string },
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

/**
 * The session kinds with a launch recipe. It compiles only while every kind in
 * `shared/session-kinds` is a RuntimeSessionKind: a new kind needs its recipe first.
 */
const recipeKinds: readonly RuntimeSessionKind[] = sessionKinds;

/** The session kind of a launch recipe; throws for a kind without one. */
function recipeKind(kind: string): RuntimeSessionKind {
  const known = recipeKinds.find((candidate) => candidate === kind);
  if (known === undefined) {
    throw new Error(`The session kind ${kind} has no launch recipe`);
  }
  return known;
}

/** The agent's availability on this machine now; throws the reason when it is unavailable. */
async function availableHost(
  { agents, inspectHost }: Pick<AgentRuntimeDependencies, "agents" | "inspectHost">,
  agent: string,
): Promise<{ agent: AgentKind; host: AgentHost }> {
  if (!isAgentKind(agent) || !agents.includes(agent)) {
    throw new Error(`The agent ${agent} is not offered`);
  }
  const host = await inspectHost();
  const [availability] = agentAvailability([agent], host);
  if (availability?.available !== true) {
    throw new Error(availability?.reason ?? `The agent ${agent} is not available`);
  }
  return { agent, host };
}

export function createAgentRuntime(dependencies: AgentRuntimeDependencies): AgentRuntime {
  const { agents, inspectHost, dataDirectory, launch } = dependencies;
  return {
    listAgents: async () => agentAvailability(agents, await inspectHost()),
    start: async ({ agent: requested, kind, workingDirectory, ...request }) => {
      const sessionKind = recipeKind(kind);
      const { agent, host } = await availableHost(dependencies, requested);
      const recipe = launchRecipe({
        agent,
        sessionKind,
        host,
        dataDirectory,
        sessionDirectory: workingDirectory,
      });
      const gate = permissionGate(agent, request);
      return forgettingTurns(await launch(recipe, gate.session), gate.endTurn);
    },
  };
}
