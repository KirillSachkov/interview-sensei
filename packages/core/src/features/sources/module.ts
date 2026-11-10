import type { Database, RunInTransaction, Transaction } from "../../shared/storage/index.ts";
import type { Clock, Timer } from "../../shared/time/index.ts";
import { createInbox } from "./application/inbox.ts";
import { createSources } from "./application/sources.ts";
import type {
  DuplicateFilter,
  InboxAgents,
  InboxQuestions,
  InboxSessions,
  SourceTargets,
} from "./domain/ports.ts";
import { drizzleInboxRepository } from "./infrastructure/drizzle-inbox-repository.ts";
import { drizzleSourceRepository } from "./infrastructure/drizzle-source-repository.ts";
import { sourceFileStore } from "./infrastructure/file-store.ts";
import { textExtractor } from "./infrastructure/text-extractor.ts";
import { sourceTextStore } from "./infrastructure/text-store.ts";

/**
 * The Sources of each Target: rows on the server's database and files under `targets/` in the
 * data directory. A Source belongs to a Target that `targets` knows. Its `inbox` runs the Inbox
 * processing: it reads the texts itself, starts the agent through `sessions`, writes Questions
 * through `questions` and Topics into the plan through `targets`, in one transaction each.
 */
export function sourcesModule(dependencies: SourcesModuleDependencies) {
  const { database, dataDirectory, clock, timer, targets } = dependencies;
  const repository = drizzleSourceRepository(database);
  const inboxRepository = drizzleInboxRepository(database);
  const files = sourceFileStore(dataDirectory);
  const sources = createSources({ repository, files, targets, clock });
  const inbox = createInbox({
    ...dependencies,
    repository,
    inbox: inboxRepository,
    files,
    texts: sourceTextStore(dataDirectory),
    extractor: textExtractor(timer),
  });
  return {
    ...sources,
    /** Erases the Target's Sources and its Inbox processing; the files go after. */
    eraseTarget: async (targetId: string, opened: Transaction) => {
      await sources.eraseTarget(targetId, opened);
      await inboxRepository.erase(targetId, opened);
    },
    inbox,
  };
}

interface SourcesModuleDependencies {
  database: Database;
  transaction: RunInTransaction;
  /** The data directory this server owns. */
  dataDirectory: string;
  clock: Clock;
  /** Limits the wait for a web page. */
  timer: Timer;
  /** The targets slice. */
  targets: SourceTargets<Transaction>;
  /** The agent-runtime slice. */
  agents: InboxAgents;
  /** The question-bank slice. */
  questions: InboxQuestions<Transaction>;
  /** The duplicate rule of the target-setup slice. */
  duplicates: DuplicateFilter;
  /** The agent-sessions slice. */
  sessions: InboxSessions;
  /** Receives errors of background work. */
  onError: (error: unknown) => void;
  /** Hears that an Inbox processing or Recheck of the Target ended. */
  onRunFinished: (finished: {
    readonly targetId: string;
    readonly mode: "processing" | "recheck";
  }) => void;
}
