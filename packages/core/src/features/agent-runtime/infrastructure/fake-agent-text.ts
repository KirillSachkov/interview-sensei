// How the fake agent sends text: in chunks of one word, like a real stream; and the Markdown sample
// of `/markdown`.
import { setTimeout as delay } from "node:timers/promises";

import type { AgentContext } from "@agentclientprotocol/sdk/unstable";

// A short pause between chunks lets a person see the reply grow; the fake agent stands for an
// external program and has no injected Timer.
const chunkPauseMs = 40;

/** Sends one `agent_message_chunk`. */
export async function sendChunk(
  client: AgentContext,
  sessionId: string,
  text: string,
): Promise<void> {
  await client.notify("session/update", {
    sessionId,
    update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text } },
  });
}

/** Sends the text in chunks of one word without ending the turn. */
export async function sendText(
  client: AgentContext,
  sessionId: string,
  text: string,
): Promise<void> {
  for (const word of text.split(/(?<= )/u)) {
    /* oxlint-disable eslint/no-await-in-loop -- chunks go out one after another, like a real stream */
    await sendChunk(client, sessionId, word);
    await delay(chunkPauseMs);
    /* oxlint-enable eslint/no-await-in-loop */
  }
}

/**
 * The reply to `/markdown`: Markdown as real agents write it, with raw HTML that the chat must show
 * as text.
 */
export const markdownSample = [
  "**Жирный** текст и `код`.",
  "",
  "- первый пункт",
  "- второй пункт",
  "",
  "```ts",
  "const answer = 42;",
  "```",
  "",
  "| Тема | Статус |",
  "| --- | --- |",
  "| Горутины | шатко |",
  "",
  "[Документация](https://example.com/docs) и <b>сырой HTML</b>",
].join("\n");
