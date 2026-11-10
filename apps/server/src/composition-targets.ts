// A part of composition.ts (`server-composes-features-in-one-module`): Targets, their Questions,
// the drafts of their changes, their materials, the application's settings and the demo Target.
// Only composition.ts imports this module.
import {
  questionBankModule,
  questionBankMigrations,
  searchQuestions,
  demoBank,
  demoTarget,
} from "@interview-sensei/core/question-bank";
import { targetsModule, targetsMigrations, getTarget } from "@interview-sensei/core/targets";
import {
  draftTools,
  setupBrief,
  targetSetupMigrations,
  targetSetupModule,
  withoutDuplicates,
} from "@interview-sensei/core/target-setup";
import { appSettingsMigrations, appSettingsModule } from "@interview-sensei/core/app-settings";
import {
  getSource,
  inboxTools,
  listSources,
  proposeInboxProcessing,
  proposeRecheck,
  sourceTools,
  sourcesMigrations,
  sourcesModule,
} from "@interview-sensei/core/sources";
import type { AgentRuntime } from "@interview-sensei/core/agent-runtime";
import type { SliceMigrations, Storage, StorageOptions } from "@interview-sensei/core/storage";

export { UnknownAgentError } from "@interview-sensei/core/targets";

type Clock = StorageOptions["clock"];
type Timer = StorageOptions["timer"];

/** The migrations of the slices this module composes, in the order composition.ts applies them. */
export const targetSliceMigrations: readonly SliceMigrations[] = [
  questionBankMigrations,
  targetsMigrations,
  targetSetupMigrations,
  appSettingsMigrations,
  sourcesMigrations,
];

type SetupAttempts = Parameters<typeof targetSetupModule>[0]["attempts"];
type QuestionAttempts = Parameters<typeof questionBankModule>[0]["attempts"];
type InboxSessions = Parameters<typeof sourcesModule>[0]["sessions"];

/** What the slices of this module take from the server besides the storage. */
export interface TargetSliceDependencies {
  readonly clock: Clock;
  readonly timer: Timer;
  readonly dataDirectory: string;
  /**
   * The interviews slice: a Topic merge of a draft moves the merged Topic's Attempts, and a deleted
   * Question with Attempts is hidden instead.
   */
  readonly attempts: SetupAttempts & QuestionAttempts;
  /** The agent-sessions slice, built after these slices: Inbox processing starts its agent there. */
  readonly sessions: InboxSessions;
  /** Receives the failures of background work. */
  readonly onError: (error: unknown) => void;
  /** Hears that an Inbox processing of the Target started: it takes over a running answer search. */
  readonly onInboxStarted: Parameters<typeof sourcesModule>[0]["onRunStarted"];
  /** Hears that an Inbox processing of the Target ended: a waiting answer search begins. */
  readonly onInboxFinished: Parameters<typeof sourcesModule>[0]["onRunFinished"];
}

/**
 * Targets, their Questions, the drafts of their changes, their materials in the data directory and
 * the application's settings; a Target's agent is one of the agents that `runtime` offers, or the
 * default agent of the settings. A Topic merge of a draft moves the Attempts through `attempts`,
 * the interviews slice.
 */
export function composeTargets(
  storage: Storage,
  {
    clock,
    timer,
    dataDirectory,
    attempts,
    sessions,
    onError,
    onInboxStarted,
    onInboxFinished,
  }: TargetSliceDependencies,
  runtime: AgentRuntime,
) {
  const { database } = storage;
  const questionBank = questionBankModule({ database, attempts });
  const appSettings = appSettingsModule({ database, agents: runtime });
  const targets = targetsModule({
    database,
    clock,
    topics: questionBank,
    agents: runtime,
    defaults: appSettings,
  });
  const targetSetup = targetSetupModule({
    database,
    transaction: storage.transaction,
    clock,
    targets,
    topics: questionBank,
    attempts,
  });
  const sources = sourcesModule({
    database,
    transaction: storage.transaction,
    dataDirectory,
    clock,
    timer,
    targets,
    agents: runtime,
    questions: questionBank,
    duplicates: { withoutDuplicates },
    sessions,
    onError,
    onRunStarted: onInboxStarted,
    onRunFinished: onInboxFinished,
  });
  return { questionBank, targets, targetSetup, appSettings, sources };
}

type TargetSlices = ReturnType<typeof composeTargets>;

/**
 * The MCP tools of these slices: the Target setup's set, the Inbox processing's set and the reading
 * tools of other kinds.
 */
export function targetTools({ targets, questionBank, targetSetup, sources }: TargetSlices) {
  const reading = {
    getTarget: getTarget(targets),
    searchQuestions: searchQuestions(questionBank, targets),
  };
  return {
    ...reading,
    listSources: listSources(sources),
    getSource: getSource(sources),
    setup: [
      setupBrief(targetSetup),
      reading.getTarget,
      reading.searchQuestions,
      ...draftTools(targetSetup),
      ...sourceTools(sources),
      proposeInboxProcessing(sources.inbox),
      proposeRecheck(sources.inbox),
    ],
    inbox: [
      ...inboxTools(sources.inbox),
      reading.getTarget,
      reading.searchQuestions,
      getSource(sources),
    ],
  };
}

type DemoDependencies = Pick<TargetSlices, "targets" | "questionBank"> & { clock: Clock };

async function createDemoTarget({ targets, questionBank, clock }: DemoDependencies) {
  const targetId = crypto.randomUUID();
  const { topics, questions, topicIdOf } = demoBank(targetId, clock.now().toISOString());
  await questionBank.seed(topics, questions);
  // Publish the Target only after its Question bank is ready.
  return targets.create({
    id: targetId,
    name: demoTarget.name,
    level: demoTarget.level,
    status: "active",
    demo: true,
    sections: demoTarget.sections.map((section, position) => ({
      id: crypto.randomUUID(),
      position,
      name: section.name,
      kind: section.kind,
      gradingCriteria: section.gradingCriteria,
      enabled: true,
      topicIds: section.topicKeys.map((key) => topicIdOf(key)),
    })),
  });
}
async function existingDemo(targets: TargetSlices["targets"]) {
  const existing = await targets.activeDemo();
  if (existing === undefined) {
    return null;
  }
  const target = await targets.get(existing.id);
  if (target === undefined) {
    throw new Error("The demo Target disappeared");
  }
  return target;
}
/** Creates the demo Target once; later calls get the existing one. */
export function demoCreator(dependencies: DemoDependencies) {
  let creating: Promise<Awaited<ReturnType<typeof createDemoTarget>>> | null = null;
  return async () => {
    const target = await existingDemo(dependencies.targets);
    if (target !== null) {
      return { target, created: false };
    }
    if (creating !== null) {
      return { target: await creating, created: false };
    }
    creating = createDemoTarget(dependencies);
    try {
      return { target: await creating, created: true };
    } finally {
      creating = null;
    }
  };
}
