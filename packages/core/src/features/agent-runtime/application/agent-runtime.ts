import { isSessionKind, sessionProfiles } from "../../../shared/session-kinds/index.ts";
import type { SessionProfile } from "../../../shared/session-kinds/index.ts";
import type { AgentAvailability, AgentHost, AgentKind } from "../domain/agent.ts";
import { agentAvailability, isAgentKind } from "../domain/agent.ts";
import { launchRecipe } from "../domain/launch-recipe.ts";
import { opencodeKeys, opencodeSubscriptionProviders } from "../domain/opencode-credentials.ts";
import type { OpencodeCredentialRow, OpencodeKey } from "../domain/opencode-credentials.ts";
import { opencodeConfigSchema } from "../domain/opencode-recipe.ts";
import type { LaunchProfile, SkillSource } from "../domain/launch-recipe.ts";
import { automaticAnswer, refusal } from "../domain/permissions.ts";
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
  /** Reads the `credential` table of the Candidate's OpenCode 2.x database; none when it cannot. */
  readonly readOpencodeCredentials: (database: string) => Promise<readonly OpencodeCredentialRow[]>;
  /** Gets a problem the Candidate can fix, such as an OpenCode login the session cannot use; no secrets. */
  readonly onWarning: (message: string) => void;
  /** The data directory: the agents' own homes and configs live in it. */
  readonly dataDirectory: string;
  /** Reads a skill of the application by its directory name, at each start. */
  readonly readSkill: (name: string) => Promise<SkillSource>;
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
    request: SessionRequest & {
      agent: string;
      kind: string;
      /** Text added after the role of the kind's profile, such as a mock interview's tone. */
      roleAddition?: string;
      workingDirectory: string;
    },
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
 * permission requests for our MCP tools by itself. Other requests go to the Candidate, or get the
 * server's refusal when the profile does not `askCandidate`. A finished tool call and the end of
 * the turn remove the kept tool calls.
 */
function permissionGate(
  { agent, askCandidate }: { agent: AgentKind; askCandidate: boolean },
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
      if (answer !== null) {
        return answer;
      }
      // The Candidate sees the announced tool call too: the request may carry only its id.
      return askCandidate
        ? request.onPermission({ ...permission, toolCall: { ...earlier, ...permission.toolCall } })
        : refusal(permission.options);
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

/** The profile of the session kind; throws for an unknown kind. */
function profileOf(kind: string): SessionProfile {
  if (!isSessionKind(kind)) {
    throw new Error(`The session kind ${kind} has no profile`);
  }
  return sessionProfiles[kind];
}

/** The profile as the recipes take it, with the role addition and the skill's files read now. */
async function launchProfile(
  { role, skill, shell, web }: SessionProfile,
  {
    roleAddition,
    readSkill,
  }: { roleAddition: string | undefined; readSkill: AgentRuntimeDependencies["readSkill"] },
): Promise<LaunchProfile> {
  return {
    role: roleAddition === undefined ? role : `${role}\n\n${roleAddition}`,
    skill: await readSkill(skill),
    shell,
    web,
  };
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

/**
 * The Candidate's keys for an OpenCode 2.x session, read only now, so listing the agents never
 * touches the secrets. Other agents and 1.x, which reads the linked `auth.json`, get none.
 * A provider of the session with only a subscription (OAuth) login gets no key and a warning (#69).
 */
async function sessionKeys(
  agent: AgentKind,
  host: AgentHost,
  {
    readOpencodeCredentials: read,
    onWarning,
  }: Pick<AgentRuntimeDependencies, "readOpencodeCredentials" | "onWarning">,
): Promise<readonly OpencodeKey[]> {
  if (
    agent !== "opencode" ||
    host.opencodeDatabase === null ||
    opencodeConfigSchema(host.opencodeVersion) !== "2.x"
  ) {
    return [];
  }
  const rows = await read(host.opencodeDatabase);
  for (const provider of opencodeSubscriptionProviders(rows, host.opencodeModel)) {
    onWarning(
      `OpenCode 2.x: ${provider} has only a subscription (OAuth) login, which sessions of the application cannot use; log in to it with an API key`,
    );
  }
  return opencodeKeys(rows, host.opencodeModel);
}

export function createAgentRuntime(dependencies: AgentRuntimeDependencies): AgentRuntime {
  const { agents, inspectHost, dataDirectory, readSkill, launch } = dependencies;
  return {
    listAgents: async () => agentAvailability(agents, await inspectHost()),
    start: async ({ agent: requested, kind, roleAddition, workingDirectory, ...request }) => {
      const sessionProfile = profileOf(kind);
      const { agent, host } = await availableHost(dependencies, requested);
      const recipe = launchRecipe({
        agent,
        profile: await launchProfile(sessionProfile, { roleAddition, readSkill }),
        host,
        opencodeKeys: await sessionKeys(agent, host, dependencies),
        dataDirectory,
        sessionDirectory: workingDirectory,
      });
      const gate = permissionGate({ agent, askCandidate: sessionProfile.askCandidate }, request);
      return forgettingTurns(await launch(recipe, gate.session), gate.endTurn);
    },
  };
}
