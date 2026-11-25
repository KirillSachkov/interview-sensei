import { createServer } from "node:http";
import { once } from "node:events";
import { text } from "node:stream/consumers";
import { goalSetup, goalSetupMessage } from "@sensei/contracts";

const replies = new Map([
  [
    "Хочу готовиться на middle Go",
    {
      changes: { role: "Go-разработчик", level: "middle" },
      replyKind: "conversation",
      reply: "На каком рынке ищешь работу?",
    },
  ],
  [
    "В России",
    {
      changes: { market: "Россия" },
      replyKind: "proposal",
      reply:
        "Готовиться к собеседованиям на позицию Go-разработчика уровня middle на российском рынке.",
    },
  ],
  [
    "Да, только senior",
    {
      changes: { level: "senior" },
      replyKind: "proposal",
      reply:
        "Готовиться к собеседованиям на позицию Go-разработчика уровня senior на российском рынке.",
    },
  ],
  [
    "А рынок остался тот же?",
    {
      changes: { market: null },
      replyKind: "conversation",
      reply: "Да, целевой рынок по-прежнему Россия.",
    },
  ],
]);

const inputSchema = goalSetup.extend({
  message: goalSetupMessage.shape.message,
});

export async function startControlledOllama(
  beforeReply: (message: string) => Promise<void>,
) {
  const calls: string[] = [];
  const server = createServer(async (request, response) => {
    try {
      const body: unknown = JSON.parse(await text(request));
      if (
        request.url !== "/api/chat" ||
        !body ||
        typeof body !== "object" ||
        !("messages" in body) ||
        !Array.isArray(body.messages)
      )
        throw new Error("Expected Ollama chat request");
      const candidate: unknown = body.messages.at(-1);
      if (
        !candidate ||
        typeof candidate !== "object" ||
        !("content" in candidate) ||
        typeof candidate.content !== "string"
      )
        throw new Error("Expected goal setup input");
      const input = inputSchema.parse(JSON.parse(candidate.content));
      calls.push(input.message);
      const reply = replies.get(input.message);
      if (!reply) throw new Error("Unexpected candidate message");
      await beforeReply(input.message);
      response.setHeader("Content-Type", "application/x-ndjson");
      response.end(
        JSON.stringify({
          model: "controlled-goal-setup",
          created_at: new Date().toISOString(),
          message: { role: "assistant", content: JSON.stringify(reply) },
          done: true,
          done_reason: "stop",
        }) + "\n",
      );
    } catch {
      response.writeHead(400).end();
    }
  });
  server.listen(0, "0.0.0.0");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Missing model port");
  return {
    calls,
    url: `http://host.docker.internal:${address.port}`,
    close: () =>
      new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      ),
  };
}
