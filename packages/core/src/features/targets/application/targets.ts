import { randomUUID } from "node:crypto";

import type { Clock } from "../../../shared/time/index.ts";
import type { TargetRepository, TargetTopics } from "../domain/ports.ts";
import type { NewTarget, Section, Target, TargetView, TopicSummary } from "../domain/target.ts";

interface Dependencies {
  repository: TargetRepository;
  topics: TargetTopics;
  clock: Clock;
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
): Promise<TargetView | undefined> {
  const target = await repository.get(id);
  if (target === undefined) {
    return undefined;
  }
  const [plan, preferences, targetTopics] = await Promise.all([
    repository.sections(id),
    repository.preferences(id),
    topics.topics(id),
  ]);
  return { ...target, sections: withTopics(plan, targetTopics), preferences };
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
  if (
    plan.some((section) =>
      section.topicIds.some((topicId) => !targetTopics.some((topic) => topic.id === topicId)),
    )
  ) {
    throw new Error("A Section must reference only Topics of its own Target");
  }
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
    get: async (id: string) => get(dependencies, id),
    list: repository.list,
    activeDemo: repository.activeDemo,
    topicIds: async (targetId: string, sectionId: string) => {
      const plan = await repository.sections(targetId);
      return plan.find((section) => section.id === sectionId)?.topicIds;
    },
  };
}
export type Targets = ReturnType<typeof createTargets>;
