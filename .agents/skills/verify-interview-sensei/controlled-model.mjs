#!/usr/bin/env node
// Controlled model: an Ollama-compatible /api/chat that returns scripted answers.
// Usage: controlled-model.mjs --port <port> --replies <replies.json> --calls <calls.jsonl>
// It stands in for Ollama at the OLLAMA_BASE_URL boundary and logs every call it receives.
import { createServer } from "node:http";
import { appendFileSync, readFileSync } from "node:fs";
import { text } from "node:stream/consumers";

const args = Object.fromEntries(
  process.argv
    .slice(2)
    .map((value, index, all) =>
      value.startsWith("--") ? [value.slice(2), all[index + 1]] : undefined,
    )
    .filter(Boolean),
);
const port = Number(args.port);
if (!port || !args.replies || !args.calls) {
  console.error(
    "Usage: controlled-model.mjs --port <port> --replies <file> --calls <file>",
  );
  process.exit(2);
}
const normalize = (message) => message.trim().toLowerCase();
const replies = new Map(
  Object.entries(JSON.parse(readFileSync(args.replies, "utf8"))).map(
    ([message, reply]) => [normalize(message), reply],
  ),
);
const record = (entry) =>
  appendFileSync(
    args.calls,
    JSON.stringify({ at: new Date().toISOString(), ...entry }) + "\n",
  );

const server = createServer(async (request, response) => {
  if (request.method === "GET" && request.url === "/health") {
    response.setHeader("Content-Type", "application/json");
    response.end(JSON.stringify({ controlled: true, replies: replies.size }));
    return;
  }
  try {
    if (request.method !== "POST" || request.url !== "/api/chat")
      throw new Error("Expected POST /api/chat");
    const body = JSON.parse(await text(request));
    const input = JSON.parse(body.messages.at(-1).content);
    const reply = replies.get(normalize(input.message));
    record({
      message: input.message,
      revision: input.draft?.revision,
      scripted: Boolean(reply),
    });
    if (!reply) throw new Error("No scripted reply");
    response.setHeader("Content-Type", "application/x-ndjson");
    response.end(
      JSON.stringify({
        model: body.model,
        created_at: new Date().toISOString(),
        message: { role: "assistant", content: JSON.stringify(reply) },
        done: true,
        done_reason: "stop",
      }) + "\n",
    );
  } catch (error) {
    response.writeHead(400).end(String(error));
  }
});
server.listen(port, "0.0.0.0", () =>
  console.log(`controlled model listening on ${port}`),
);
process.once("SIGTERM", () => server.close());
