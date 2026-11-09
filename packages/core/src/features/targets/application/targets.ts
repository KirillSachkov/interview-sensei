import { randomUUID } from "node:crypto";

import type { Transaction } from "../../../shared/storage/index.ts";
import type { Clock } from "../../../shared/time/index.ts";
import type { TargetAgents, TargetRepository, TargetTopics } from "../domain/ports.ts";
import type {
  NewTarget,
  Preference,
  Section,
  Target,
  TargetAgent,
  TargetUpdate,
  TargetView,
  TopicSummary,
} from "../domain/target.ts";

interface Dependencies {
  repository: TargetRepository<Transaction>;
  topics: TargetTopics<Transaction>;
  agents: TargetAgents;
  clock: Clock;
}

/** The agent is not one of the agents the server offers. */
export class UnknownAgentError extends Error {
  override name = "UnknownAgentError";
}

/** The choice, or the first available agent with `chosen: false`; null when none is available. */
async function targetAgent(agents: TargetAgents, chosen: string | null): Promise<TargetAgent> {
  if (chosen !== null) {
    return { agent: chosen, chosen: true };
  }
  const offered = await agents.listAgents();
  return { agent: offered.find((entry) => entry.available)?.agent ?? null, chosen: false };
}

/**
 * Stores the Candidate's choice, or null for the default agent; undefined for an unknown Target.
 * Rejects with UnknownAgentError for an agent the server does not offer; an unavailable one stays.
 */
async function setAgent(
  { repository, agents }: Dependencies,
  id: string,
  agent: string | null,
): Promise<TargetAgent | undefined> {
  const offered = agent === null ? [] : await agents.listAgents();
  if (agent !== null && !offered.some((entry) => entry.agent === agent)) {
    throw new UnknownAgentError(`The server does not offer the agent ${agent}`);
  }
  return (await repository.setAgent(id, agent)) ? targetAgent(agents, agent) : undefined;
}

function withTopics(plan: readonly Section[], topics: readonly TopicSummary[]) {
  return plan.map((section) => ({
    ...section,
    topics: section.topicIds.flatMap((id) => topics.filter((topic) => topic.id === id)),
  }));
}

async function get(
  { repository, topics }: Dependencies,
  id: string,
  transaction?: Transaction,
): Promise<TargetView | undefined> {
  const target = await repository.get(id, transaction);
  if (target === undefined) {
    return undefined;
  }
  const [plan, preferences, targetTopics] = await Promise.all([
    repository.sections(id, transaction),
    repository.preferences(id, transaction),
    topics.topics(id, transaction),
  ]);
  return { ...target, sections: withTopics(plan, targetTopics), preferences };
}

/** Rejects a Section that references a Topic outside its Target. */
function checkTopics(plan: readonly Section[], targetTopics: readonly TopicSummary[]): void {
  if (
    plan.some((section) =>
      section.topicIds.some((topicId) => !targetTopics.some((topic) => topic.id === topicId)),
    )
  ) {
    throw new Error("A Section must reference only Topics of its own Target");
  }
}

/**
 * Stores the Target's new fields, status and Interview plan; undefined for an unknown Target. Pass
 * the transaction when other slices write in it too: every query then runs inside it.
 */
async function update(
  dependencies: Dependencies,
  {
    id,
    change,
    transaction,
  }: { id: string; change: TargetUpdate; transaction: Transaction | undefined },
): Promise<TargetView | undefined> {
  const { repository, topics } = dependencies;
  const plan = change.sections.map((section) => ({ ...section, targetId: id }));
  checkTopics(plan, await topics.topics(id, transaction));
  const found = await repository.update(id, { ...change, sections: plan }, transaction);
  return found ? get(dependencies, id, transaction) : undefined;
}

function targetRecord(
  input: NewTarget,
  { id, createdAt }: { id: string; createdAt: string },
): Target {
  return {
    id,
    name: input.name ?? "",
    status: input.status ?? "draft",
    level: input.level ?? null,
    agent: input.agent ?? null,
    tone: input.tone ?? "neutral",
    language: input.language ?? "ru",
    demo: input.demo ?? false,
    createdAt,
  };
}

async function create(dependencies: Dependencies, input: NewTarget): Promise<TargetView> {
  const { repository, topics, clock } = dependencies;
  const createdAt = clock.now().toISOString(),
    id = input.id ?? randomUUID();
  const target = targetRecord(input, { id, createdAt });
  const plan = (input.sections ?? []).map((section) => ({
    id: section.id,
    targetId: id,
    position: section.position,
    name: section.name,
    kind: section.kind,
    gradingCriteria: section.gradingCriteria,
    enabled: section.enabled,
    topicIds: section.topicIds,
  }));
  const targetTopics = await topics.topics(id);
  checkTopics(plan, targetTopics);
  const preferences = (input.preferences ?? []).map((rule) => ({
    id: rule.id,
    text: rule.text,
    rejectedQuestionIds: rule.rejectedQuestionIds,
    active: rule.active,
    targetId: id,
    createdAt,
  }));
  await repository.create(target, plan, preferences);
  return {
    ...target,
    sections: withTopics(
      plan.toSorted((left, right) => left.position - right.position),
      targetTopics,
    ),
    preferences: preferences.filter((rule) => rule.active),
  };
}

export function createTargets(dependencies: Dependencies) {
  const { repository } = dependencies;
  return {
    create: async (input: NewTarget = {}) => create(dependencies, input),
    get: async (id: string, transaction?: Transaction) => get(dependencies, id, transaction),
    update: async (id: string, change: TargetUpdate, transaction?: Transaction) =>
      update(dependencies, { id, change, transaction }),
    list: repository.list,
    activeDemo: repository.activeDemo,
    /** The Target's agent; undefined for an unknown Target. */
    agent: async (id: string) => {
      const target = await repository.get(id);
      return target === undefined ? undefined : targetAgent(dependencies.agents, target.agent);
    },
    setAgent: async (id: string, agent: string | null) => setAgent(dependencies, id, agent),
    /**
     * Adds the Preferences with new ids and stores the text, examples and activity of the
     * Target's existing ones.
     */
    savePreferences: async (
      targetId: string,
      rules: readonly Omit<Preference, "targetId" | "createdAt">[],
      transaction?: Transaction,
    ) => {
      const createdAt = dependencies.clock.now().toISOString();
      await repository.savePreferences(
        rules.map((rule) => ({ ...rule, targetId, createdAt })),
        transaction,
      );
    },
    topicIds: async (targetId: string, sectionId: string) => {
      const plan = await repository.sections(targetId);
      return plan.find((section) => section.id === sectionId)?.topicIds;
    },
  };
}
export type Targets = ReturnType<typeof createTargets>;
