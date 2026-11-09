// Helpers of the progress, Dispute and session history API tests on the demo Target, and a demo
// Target with a finished Mock interview for the deletion tests.
import { browserHeaders } from "./chat-test-support.ts";
import { ask, cardAt, interviewApi, isGraded } from "./interview-test-support.ts";
import type { Card } from "./interview-test-support.ts";

type Api = Awaited<ReturnType<typeof interviewApi>>;
type Chat = Awaited<ReturnType<Api["started"]>>["chat"];

/** Disputes the card's Grade with the payload, `{ grade, reason }` when valid. */
export async function dispute(
  api: Api,
  { interviewId, card, payload }: { interviewId: string; card: Card; payload: object },
) {
  return api.server.inject({
    method: "POST",
    url: `/api/interviews/${interviewId}/attempts/${card.attemptId}/dispute`,
    headers: browserHeaders(api.server),
    payload,
  });
}

/** The text of the first content block of a JSON-RPC answer to `tools/call`. */
function toolText(answer: unknown): string {
  if (
    typeof answer === "object" &&
    answer !== null &&
    "result" in answer &&
    typeof answer.result === "object" &&
    answer.result !== null &&
    "content" in answer.result &&
    Array.isArray(answer.result.content)
  ) {
    const block: unknown = answer.result.content.at(0);
    if (typeof block === "object" && block !== null && "text" in block) {
      return String(block.text);
    }
  }
  throw new Error(`Unexpected tool answer: ${JSON.stringify(answer)}`);
}

/** Calls our MCP tool on the address that `/mcp` reveals in the interviewer chat; its JSON result. */
export async function callTool(chat: Chat, name: string): Promise<unknown> {
  const reply = await ask(chat, "/mcp", "MCP: ");
  const [, url = ""] = reply.slice("MCP: ".length).split(" ");
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      "mcp-protocol-version": "2025-06-18",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name, arguments: {} },
    }),
  });
  const body = await response.text();
  const data = body.split("\n").find((line) => line.startsWith("data:")) ?? "";
  return JSON.parse(toolText(JSON.parse(data.slice("data:".length))));
}

/**
 * The demo Target with a finished Mock interview: one asked question with its Attempt and a
 * Dispute. The interviewer's session has ended, so nothing of the Target runs.
 */
export async function demoWithMock(dataDirectory?: string) {
  const api = await interviewApi(dataDirectory === undefined ? {} : { dataDirectory });
  const run = await api.answered(["Опыт и резюме"], "Ответ [grade:1] [last]");
  const graded = cardAt(await run.events.waitFor(isGraded(0)), 0);
  const payload = { grade: 2, reason: "Пример был." };
  await dispute(api, { interviewId: run.interview.id, card: graded, payload });
  await api.finish(run.interview.id);
  await run.events.waitFor((view) => view.status === "finished");
  // The session ends after the agent's last turn.
  await run.chat.waitFor((view) => view.status === "ended");
  return api;
}
