// Helpers of the API tests of save_reference_answer (#70): a search whose agent has taken the whole
// queue, and Questions whose answer stays: one «из материала» from an Inbox processing and one
// «проверен кандидатом», which no API writes yet (#65).
import type { FastifyInstance } from "fastify";

import { handOut, idOf, manualSearch, manualTarget } from "./answer-test-support.ts";
import { startServer, temporaryDirectory } from "./chat-test-support.ts";
import { attach, latestReportId, startProcessing } from "./inbox-test-support.ts";
import { first, seed } from "./model-test-support.ts";
import { callTool, questionsOf } from "./setup-test-support.ts";
import type { Events } from "./setup-test-support.ts";

/** A server with the fake agent on a new data directory. */
export async function answerServer() {
  const started = await startServer(await temporaryDirectory());
  return started.server;
}

/** A running search of a `[manual]` Target whose agent has taken the whole queue. */
export async function takenQueue() {
  const app = await answerServer();
  const search = await manualSearch(app);
  const { questions } = await handOut(search.events);
  return { app, ...search, ids: (text: string) => idOf(questions, text) };
}

/** Saves the answer and resolves with the tool's reply. */
export async function saveAnswer(events: Events, answer: object) {
  return callTool(events, "save_reference_answer", answer);
}

/** Processes a note into a Question with an answer «из материала»; resolves with its id. */
export async function materialQuestion(app: FastifyInstance, targetId: string) {
  const body = "Что такое select?\nОн ждёт каналы.";
  await attach(app, { targetId, name: "notes.md", body });
  await startProcessing(app, targetId);
  await latestReportId(app, targetId);
  const bank = await questionsOf(app, targetId);
  const found = bank.find((question) => question.referenceAnswer?.origin === "material");
  if (found === undefined) {
    throw new Error("The processing wrote no answer from the material");
  }
  return found.id;
}

/** The answer the Candidate checked, as the test writes it into storage. */
const checkedAnswer = {
  points: ["Проверенный пункт", "Второй пункт", "Третий пункт"],
  sample: "Ответ, который проверил кандидат.",
  origin: "candidate",
  sourceId: null,
  part: null,
} as const;

/**
 * A `[manual]` Target whose first Question has an answer «проверен кандидатом», on a server started
 * again on the same data directory: no API marks an answer as checked yet (#65), so the test writes
 * it into storage between the two servers.
 */
export async function checkedByCandidate() {
  const dataDirectory = await temporaryDirectory();
  const before = await startServer(dataDirectory);
  const { target } = await manualTarget(before.server);
  const checked = first(await questionsOf(before.server, target.id));
  await before.stop();
  await seed(dataDirectory, async ({ questionBank }) => {
    await questionBank.editQuestions(target.id, [
      { id: checked.id, referenceAnswer: checkedAnswer },
    ]);
  });
  const { server } = await startServer(dataDirectory);
  return { server, target, checkedId: checked.id };
}
