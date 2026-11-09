// The fake agent's interviewer mode: it answers the template messages of a mock interview, which
// it knows by their first sentence, by calling our MCP tools, as a real interviewer would.
// - «The mock interview has started.»: `get_brief`, then the next question (see below).
// - «The Candidate answered the presented question.»: «Ответ получен.», then `record_attempt` with
//   the Grade of the marker `[grade:N]` in the answer, 2 without one. With the marker `[twice]` it
//   calls `record_attempt` once more and replies «Повторная запись: <tool result>». Then the next
//   question.
// - «The Candidate finished the mock interview.»: `finish_interview`, then «Итог записан.».
// The next question: the first open candidate of `next_question_candidates`, or the first one;
// `present_question` with it, then the hint «Подсказка до ответа: …» in the same turn, which the
// app keeps out of the chat. Without candidates it replies «Вопросов больше нет.».
// A failed step ends the turn with «Фейковый интервьюер сломался: <error>».
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";

import type { AgentContext } from "@agentclientprotocol/sdk/unstable";

import { callMcpTool } from "./fake-agent-mcp.ts";
import { askPermission } from "./fake-agent-permission.ts";

// The pause between chunks, as in the fake agent's other replies.
const chunkPauseMs = 40;

/** What one interviewer turn can do: call a tool of the session's MCP server and send text. */
interface InterviewerActions {
  /** Calls the tool with the arguments; resolves with its text, an error text included. */
  readonly call: (name: string, input: object) => Promise<string>;
  /** Sends text in chunks without ending the turn. */
  readonly say: (text: string) => Promise<void>;
}

/** The hint the fake interviewer sends right after it shows a question. */
const hintAfterQuestion = "Подсказка до ответа: вспомните про пример из практики.";

interface Candidate {
  readonly id: string;
  readonly format: string;
}

function candidatesOf(text: string): readonly Candidate[] {
  const parsed: unknown = JSON.parse(text);
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    !("candidates" in parsed) ||
    !Array.isArray(parsed.candidates)
  ) {
    throw new Error(`Unexpected candidates: ${text}`);
  }
  return parsed.candidates.filter(
    (candidate: unknown): candidate is Candidate =>
      typeof candidate === "object" &&
      candidate !== null &&
      "id" in candidate &&
      typeof candidate.id === "string" &&
      "format" in candidate &&
      typeof candidate.format === "string",
  );
}

async function presentNext(actions: InterviewerActions): Promise<void> {
  const candidates = candidatesOf(await actions.call("next_question_candidates", {}));
  const next = candidates.find((candidate) => candidate.format === "open") ?? candidates[0];
  if (next === undefined) {
    await actions.say("Вопросов больше нет.");
    return;
  }
  await actions.call("present_question", { questionId: next.id });
  await actions.say(hintAfterQuestion);
}

async function start(actions: InterviewerActions): Promise<void> {
  await actions.say("Начинаем мок-собеседование.");
  await actions.call("get_brief", {});
  await presentNext(actions);
}

const judgment = (grade: number) => ({
  grade,
  gaps: "Фейковый интервьюер: не хватает примера из практики.",
  justification: `Фейковый интервьюер поставил оценку из метки в ответе: ${grade}.`,
  strongAnswer: "Фейковый интервьюер: определение, ограничения и пример из практики.",
});

async function judge(actions: InterviewerActions, text: string): Promise<void> {
  const grade = Number(/\[grade:(?<grade>[0-3])\]/u.exec(text)?.groups?.grade ?? "2");
  await actions.say("Ответ получен.");
  await actions.call("record_attempt", judgment(grade));
  if (text.includes("[twice]")) {
    await actions.say(`Повторная запись: ${await actions.call("record_attempt", judgment(grade))}`);
  }
  await presentNext(actions);
}

async function finish(actions: InterviewerActions): Promise<void> {
  await actions.call("finish_interview", {
    summary: "Фейковый интервьюер: мок завершён.",
    nextStep: "Фейковый интервьюер: повторить темы с низкой оценкой.",
  });
  await actions.say("Итог записан.");
}

/** The session that a turn runs in, with its MCP server over HTTP. */
interface InterviewerSession {
  readonly client: AgentContext;
  readonly sessionId: string;
  readonly server: { readonly name: string; readonly url: string };
}

/** Calls our MCP tool after the permission request that the server allows by itself. */
async function callTool(
  { client, sessionId, server }: InterviewerSession,
  name: string,
  input: object,
) {
  const outcome = await askPermission(client, sessionId, {
    toolCallId: randomUUID(),
    title: name,
    kind: "other",
    rawInput: input,
    // The structural field the server recognizes our MCP tools by.
    _meta: { fakeAgent: { mcpServer: server.name } },
  });
  if (outcome.outcome !== "selected" || outcome.optionId === "reject-once") {
    return `Фейковый агент не получил разрешения на ${name}`;
  }
  return callMcpTool(server.url, name, input);
}

/** Sends the text in chunks of one word without ending the turn. */
async function say({ client, sessionId }: InterviewerSession, text: string): Promise<void> {
  for (const word of text.split(/(?<= )/u)) {
    /* oxlint-disable eslint/no-await-in-loop -- chunks go out one after another, like a real stream */
    await client.notify("session/update", {
      sessionId,
      update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text: word } },
    });
    await delay(chunkPauseMs);
    /* oxlint-enable eslint/no-await-in-loop */
  }
}

/** Runs the turn's steps; a failure becomes the turn's last text. */
function turnOf(steps: (actions: InterviewerActions) => Promise<void>) {
  return async (session: InterviewerSession) => {
    try {
      await steps({
        call: async (name, input) => callTool(session, name, input),
        say: async (text) => say(session, text),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await say(session, `Фейковый интервьюер сломался: ${message}`);
    }
    return { stopReason: "end_turn" as const };
  };
}

/** The interviewer's turn for a template message, or null for another prompt. */
export function interviewerTurn(text: string) {
  if (text.startsWith("The mock interview has started.")) {
    return turnOf(start);
  }
  if (text.startsWith("The Candidate answered the presented question.")) {
    return turnOf(async (actions) => judge(actions, text));
  }
  if (text.startsWith("The Candidate finished the mock interview.")) {
    return turnOf(finish);
  }
  return null;
}
