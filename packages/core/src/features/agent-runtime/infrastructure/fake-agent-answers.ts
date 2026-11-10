// The fake agent's answer search mode: on «Answer search has started.» it fills the queue with our
// MCP tools, as a real researcher would, each call after a permission request that the server
// allows.
// - A Target whose name in the opening has `[manual]` makes it stop with «Жду команд.», so an API
//   test drives the tools itself with `/tool`.
// - Otherwise it reports its usage with a `usage_update` of 4321 tokens, then takes the queue five
//   Questions at a time with next_questions_without_answer.
// - The first Question of each batch and a Question with an answer «из знаний агента» get an answer
//   «из интернета» with a link to example.com; the others one «из знаний агента».
// - A refused save goes to the report's `failed` with the tool's error.
// - Then write_answer_report with a summary.
// A failed step ends the turn with «Фейковый поисковик сломался: <error>».
// `/usage <tokens>` sends a `usage_update` with these tokens in any session and replies «Расход: <tokens>».
import type { AgentContext } from "@agentclientprotocol/sdk/unstable";

import { sendText } from "./fake-agent-text.ts";
import { allowedCall, call } from "./fake-agent-tool.ts";
import type { FakeSession } from "./fake-agent-tool.ts";

const opening = "Answer search has started.";

/** The tokens the fake researcher reports by itself. */
const reportedTokens = 4321;

interface Queued {
  readonly id: string;
  readonly text: string;
  readonly currentOrigin: "agent" | null;
}

// The fake agent trusts the shapes of our own tools' results.
// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the result of our own tool
const batchOf = (result: unknown) => result as { readonly questions: readonly Queued[] };

/** Sends a `usage_update` with the tokens, as agents report their usage. */
export async function sendUsage(
  client: AgentContext,
  sessionId: string,
  tokens: number,
): Promise<void> {
  await client.notify("session/update", {
    sessionId,
    update: { sessionUpdate: "usage_update", used: tokens, size: 200_000 },
  });
}

/** The tokens of `/usage <tokens>`, or null for other text. */
export function usageCommand(text: string): number | null {
  const match = /^\/usage (?<tokens>\d+)$/u.exec(text.trim());
  return match?.groups?.tokens === undefined ? null : Number(match.groups.tokens);
}

/** The answer the fake researcher writes for the Question. */
function answerOf(question: Queued, internet: boolean) {
  return {
    questionId: question.id,
    points: [`Суть: ${question.text}`, "Как это работает внутри", "Типичные ошибки и компромиссы"],
    sample: `Короткий ответ на вопрос «${question.text}».`,
    ...(internet
      ? { origin: "internet", links: ["https://example.com/answers"] }
      : { origin: "agent", links: [] }),
  };
}

/** Writes an answer for each Question of the batch; resolves with the refused ones. */
async function fillBatch(session: FakeSession, batch: readonly Queued[]) {
  const failed: { questionId: string; reason: string }[] = [];
  for (const [index, question] of batch.entries()) {
    const internet = index === 0 || question.currentOrigin === "agent";
    // oxlint-disable-next-line eslint/no-await-in-loop -- one answer after another, as an agent writes
    const result = await allowedCall(
      session,
      "save_reference_answer",
      answerOf(question, internet),
    );
    if (result === null || result.isError) {
      failed.push({ questionId: question.id, reason: result?.text ?? "нет разрешения" });
    }
  }
  return failed;
}

/** Fills the queue batch by batch, then writes the report. */
async function fillAll(session: FakeSession): Promise<void> {
  const failed: { questionId: string; reason: string }[] = [];
  let written = 0;
  for (;;) {
    // oxlint-disable-next-line eslint/no-await-in-loop -- the queue goes batch by batch
    const { questions } = batchOf(await call(session, "next_questions_without_answer", {}));
    if (questions.length === 0) {
      break;
    }
    // oxlint-disable-next-line eslint/no-await-in-loop -- each batch after the previous one
    const refused = await fillBatch(session, questions);
    failed.push(...refused);
    written += questions.length - refused.length;
  }
  await call(session, "write_answer_report", {
    summary: `Фейковый поисковик: записано ответов: ${written}.`,
    failed,
  });
}

async function search(session: FakeSession, text: string): Promise<void> {
  const say = async (reply: string) => sendText(session.client, session.sessionId, reply);
  await say("Начинаю поиск ответов.");
  if (text.includes("[manual]")) {
    await say("Жду команд.");
    return;
  }
  await sendUsage(session.client, session.sessionId, reportedTokens);
  await fillAll(session);
  await say("Поиск завершён.");
}

/** The answer search's turn for the opening message, or null for another prompt. */
export function answerTurn(text: string) {
  if (!text.startsWith(opening)) {
    return null;
  }
  return async (session: FakeSession) => {
    try {
      await search(session, text);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await sendText(session.client, session.sessionId, `Фейковый поисковик сломался: ${message}`);
    }
    return { stopReason: "end_turn" as const };
  };
}
