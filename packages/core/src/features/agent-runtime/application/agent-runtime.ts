import path from "node:path";

import { isSessionKind, sessionProfiles } from "../../../shared/session-kinds/index.ts";
import type { SessionProfile } from "../../../shared/session-kinds/index.ts";
import type { AgentAvailability, AgentHost, AgentKind } from "../domain/agent.ts";
import { agentAvailability, isAgentKind } from "../domain/agent.ts";
import { agentOptions } from "../domain/agent-options.ts";
import type { AgentOptions, OptionDefaults } from "../domain/agent-options.ts";
import { launchRecipe } from "../domain/launch-recipe.ts";
import type { LaunchProfile, LaunchRecipe, SkillSource } from "../domain/launch-recipe.ts";
import type { AcpLauncher, LiveAgent, SessionRequest } from "../domain/ports.ts";
import { optionProbe } from "./agent-probe.ts";
import type { HostOutcome, ProbeOutcome, ProbeRequest } from "./agent-probe.ts";
import { sessionKeys } from "./opencode-session-keys.ts";
import type { SessionKeyDependencies } from "./opencode-session-keys.ts";
import { forgettingTurns, permissionGate } from "./permission-gate.ts";

export interface AgentRuntimeDependencies extends SessionKeyDependencies {
  /** The agents this server offers; the fake agent only when the server enables it. */
  readonly agents: readonly AgentKind[];
  /**
   * Finds the adapters, programs and logins on this machine. The runtime asks at each check, so a
   * new login shows after a page reload.
   */
  readonly inspectHost: () => Promise<AgentHost>;
  /** Reads a skill of the application by its directory name, at each start. */
  readonly readSkill: (name: string) => Promise<SkillSource>;
  /**
   * The Candidate's stored model and reasoning level of the agent (#111), read at each start; the
   * app-settings slice supplies it.
   */
  readonly optionDefaults: (agent: string) => Promise<OptionDefaults>;
  readonly launch: AcpLauncher;
}

/** Checks which agents are available, starts them through ACP and passes on their events. */
export interface AgentRuntime {
  readonly listAgents: () => Promise<readonly AgentAvailability[]>;
  /**
   * Starts the agent with our MCP server and the Candidate's stored model and reasoning level. The
   * server allows calls of our MCP tools by itself; other permission requests go to `onPermission`.
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
  /**
   * The model and the reasoning levels the agent offers, read without an AgentSession and without
   * a prompt; see `optionProbe`.
   */
  readonly probeOptions: (agent: string, request: ProbeRequest) => Promise<ProbeOutcome>;
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
  { role, skill, shell, web, askCandidate }: SessionProfile,
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
    askCandidate,
  };
}

/** Whether the server offers the agent and it can run on this machine now. */
async function findHost(
  { agents, inspectHost }: Pick<AgentRuntimeDependencies, "agents" | "inspectHost">,
  agent: string,
): Promise<HostOutcome> {
  if (!isAgentKind(agent) || !agents.includes(agent)) {
    return { type: "not_offered" };
  }
  const host = await inspectHost();
  const [availability] = agentAvailability([agent], host);
  return availability?.available === true
    ? { type: "available", agent, host }
    : {
        type: "unavailable",
        reason: availability?.reason ?? `The agent ${agent} is not available`,
      };
}

/** The agent's availability on this machine now; throws the reason when it is unavailable. */
async function availableHost(
  dependencies: Pick<AgentRuntimeDependencies, "agents" | "inspectHost">,
  agent: string,
): Promise<{ agent: AgentKind; host: AgentHost }> {
  const found = await findHost(dependencies, agent);
  if (found.type === "not_offered") {
    throw new Error(`The agent ${agent} is not offered`);
  }
  if (found.type === "unavailable") {
    throw new Error(found.reason);
  }
  return found;
}

/** The isolated start of the agent on the host with the profile, in the session directory. */
async function recipeFor(
  dependencies: AgentRuntimeDependencies,
  { agent, host }: { agent: AgentKind; host: AgentHost },
  {
    profile,
    roleAddition,
    sessionDirectory,
  }: { profile: SessionProfile; roleAddition: string | undefined; sessionDirectory: string },
): Promise<LaunchRecipe> {
  const { dataDirectory, readSkill } = dependencies;
  return launchRecipe({
    agent,
    profile: await launchProfile(profile, { roleAddition, readSkill }),
    host,
    opencodeKeys: await sessionKeys(agent, host, dependencies),
    dataDirectory,
    sessionDirectory,
  });
}

/**
 * Starts the agent as the agent check does, in its own directory `probes/<agent>` of the data
 * directory and without an MCP server, chooses the model, reads the options the agent reported and
 * stops it. No prompt goes to the agent.
 */
async function readOptions(
  dependencies: AgentRuntimeDependencies,
  found: { agent: AgentKind; host: AgentHost },
  model: string | null,
): Promise<AgentOptions> {
  const recipe = await recipeFor(dependencies, found, {
    profile: sessionProfiles["service-chat"],
    roleAddition: undefined,
    sessionDirectory: path.join(dependencies.dataDirectory, "probes", found.agent),
  });
  let options: AgentOptions = { model: null, effort: null };
  const agent = await dependencies.launch(recipe, {
    mcpServer: null,
    options: { model, effort: null },
    onUpdate: (update) => {
      if (update.sessionUpdate === "config_option_update") {
        options = agentOptions(update.configOptions);
      }
    },
    onExit: () => {},
    // The probe sends no prompt, so the agent has nothing to ask permission for.
    onPermission: () => Promise.resolve({ outcome: "cancelled" }),
  });
  await agent.stop();
  return options;
}

export function createAgentRuntime(dependencies: AgentRuntimeDependencies): AgentRuntime {
  const { agents, inspectHost, optionDefaults, launch } = dependencies;
  return {
    listAgents: async () => agentAvailability(agents, await inspectHost()),
    start: async ({ agent: requested, kind, roleAddition, workingDirectory, ...request }) => {
      const profile = profileOf(kind);
      const found = await availableHost(dependencies, requested);
      const recipe = await recipeFor(dependencies, found, {
        profile,
        roleAddition,
        sessionDirectory: workingDirectory,
      });
      const { agent } = found;
      const gate = permissionGate({ agent, askCandidate: profile.askCandidate }, request);
      const options = await optionDefaults(agent);
      return forgettingTurns(await launch(recipe, { ...gate.session, options }), gate.endTurn);
    },
    probeOptions: optionProbe({
      findHost: async (agent) => findHost(dependencies, agent),
      read: async (found, model) => readOptions(dependencies, found, model),
    }),
  };
}
