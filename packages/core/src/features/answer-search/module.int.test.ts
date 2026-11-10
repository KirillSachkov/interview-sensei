// The answer search module on real PGlite, with the other slices as stubs: the races that the API
// tests cannot time, such as parallel tool calls and an Inbox processing that starts during a start.
import { randomUUID } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import { openForTest, temporaryDirectory } from "../../shared/storage/test-support.ts";
import type { AnswerBankQuestion } from "./domain/ports.ts";
import { answerSearchMigrations } from "./index.ts";
import { answerSearchModule } from "./module.ts";

const targetId = randomUUID();
const topicId = randomUUID();

function question(index: number): AnswerBankQuestion {
  return {
    id: randomUUID(),
    topicId,
    text: `Вопрос ${index}`,
    level: "middle",
    sectionKind: "topics",
    hidden: false,
    createdAt: `2026-01-0${index}T00:00:00.000Z`,
    referenceAnswer: null,
  };
}

/** Answers each check whether the Inbox processing runs in turn; the last answer stays. */
function inboxChecks(answers: readonly boolean[]) {
  const left = [...answers];
  return () => Promise.resolve(left.length > 1 ? (left.shift() ?? false) : (left[0] ?? false));
}

/**
 * The module over three Questions; `inbox` answers the checks of the Inbox processing in turn, and
 * an agent's start takes until `agentStarted` resolves.
 */
async function answerSearch({
  inbox = [false],
  agentStarted = Promise.resolve(),
}: { inbox?: readonly boolean[]; agentStarted?: Promise<unknown> } = {}) {
  const storage = await openForTest(await temporaryDirectory(), {
    migrations: [answerSearchMigrations],
  });
  const bank = [question(1), question(2), question(3)];
  const started: string[] = [];
  const stopped: string[] = [];
  const errors: unknown[] = [];
  const search = answerSearchModule({
    database: storage.database,
    transaction: storage.transaction,
    clock: { now: () => new Date("2026-02-01T00:00:00.000Z") },
    timer: { repeat: () => () => {}, after: () => () => {} },
    targets: {
      get: (id) =>
        Promise.resolve(
          id === targetId
            ? { id, name: "Go", language: "ru", status: "active" as const, sections: [] }
            : undefined,
        ),
      agent: () => Promise.resolve({ agent: "fake" }),
    },
    agents: { listAgents: () => Promise.resolve([{ agent: "fake", available: true as const }]) },
    questions: {
      topics: () => Promise.resolve([{ id: topicId, name: "Горутины" }]),
      questions: () => Promise.resolve(bank),
      editQuestions: () => Promise.resolve(),
    },
    attempts: { attempted: () => Promise.resolve([]) },
    progress: { target: () => Promise.resolve({ topics: [] }) },
    inbox: { running: inboxChecks(inbox) },
    sessions: {
      start: async () => {
        await agentStarted;
        const id = randomUUID();
        started.push(id);
        return { id };
      },
      end: () => Promise.resolve(),
      stop: (id) => {
        stopped.push(id);
        return Promise.resolve();
      },
      subscribe: () => () => {},
      view: () => Promise.resolve({ status: "working" }),
      usage: () => Promise.resolve(null),
    },
    settings: { fillInBackground: () => Promise.resolve(false) },
    onError: (error) => {
      errors.push(error);
    },
    onBackgroundSkipped: () => {},
  });
  return { search, started, stopped, errors };
}

describe("answer search module", () => {
  it("gives parallel calls of next_questions_without_answer different Questions", async () => {
    const { search, started } = await answerSearch();
    await search.start({ targetId, count: 3 });
    await search.settle();
    const session = { sessionId: String(started[0]), targetId, kind: "answer-search" };

    const batches = await Promise.all([
      search.nextQuestions(session, 2),
      search.nextQuestions(session, 2),
    ]);

    const ids = batches.flatMap((batch) => batch.questions.map((handed) => handed.id));
    expect(ids).toHaveLength(3);
    expect(new Set(ids).size).toBe(3);
  });

  it("waits when the Target's Inbox processing starts between the check and the store of a start", async () => {
    // The start's check finds no processing; by the agent's start one runs, until it ends.
    const { search, started, errors } = await answerSearch({ inbox: [false, true, true, false] });

    const outcome = await search.start({ targetId, count: 2 });
    await search.settle();
    const waiting = { outcome, state: await search.state(targetId), agents: started.length };
    search.inboxFinished({ targetId, mode: "processing", interrupted: false });
    await search.settle();
    const begun = { state: await search.state(targetId), agents: started.length };

    expect({ waiting, begun, errors }).toMatchObject({
      waiting: {
        outcome: { type: "started" },
        state: { run: { status: "waiting", total: 2 }, latestReport: null },
        agents: 0,
      },
      begun: { state: { run: { status: "running", total: 2 } }, agents: 1 },
      errors: [],
    });
  });

  it("waits when the Target's Inbox processing starts while the search's agent is starting", async () => {
    const { promise: agentStarted, resolve: startAgent } = Promise.withResolvers<null>();
    const { search, started, stopped, errors } = await answerSearch({ agentStarted });
    await search.start({ targetId, count: 2 });

    search.inboxStarted(targetId);
    await vi.waitFor(async () => {
      await expect(search.state(targetId)).resolves.toMatchObject({ run: { status: "waiting" } });
    });
    startAgent(null);
    await search.settle();

    await expect(search.state(targetId)).resolves.toMatchObject({
      run: { status: "waiting" },
      latestReport: null,
    });
    expect(stopped).toStrictEqual(started);
    expect(errors).toStrictEqual([]);
  });
});
