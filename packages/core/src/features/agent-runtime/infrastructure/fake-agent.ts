// The fake ACP agent: tests and manual checks run it instead of a real agent, which needs a
// subscription and the network. Run as `node fake-agent.ts`; it speaks ACP over stdio.
//
// Prompts:
// - `/wait` sends «Жду отмены…» and waits until the client cancels the turn.
// - `/crash` sends «Падаю…» and exits with code 1 in the middle of the turn.
// - `/fail` answers the prompt with a JSON-RPC error and keeps running.
// - `/brief` asks permission to call `get_brief` of our MCP server, then calls it over HTTP and
//   replies «Фейковый агент прочитал brief: <brief>». The server allows the call by itself.
// - `/permission` asks permission for a foreign shell command whose title names the session's MCP
//   server and tool, then replies with the chosen option: «Фейковый агент получил ответ: «<name>»».
// - `/late` ends the turn, then asks permission for a foreign command outside any turn and sends
//   «Поздний запрос: <outcome>» when the answer comes.
// - `/mcp` replies with the session's MCP server: «MCP: <name> <url>».
// - `/mode` replies with the session's permission mode: «Режим: <id>». A new session starts in
//   `candidate-mode`, which stands for the mode in the Candidate's own settings.
// - `/meta` replies with the `_meta` of `session/new` as JSON: «_meta: <json>».
// - Any other text gets the reply «Фейковый агент получил: «<text>»» in several chunks.
//
// The variable INTERVIEW_SENSEI_FAKE_AGENT_MODE stands for broken agents in launcher tests:
// - `silent` never answers and ignores SIGTERM, like a hung agent.
// - `ignore-sigterm` works but ignores SIGTERM, so only SIGKILL stops it.
import { randomUUID } from "node:crypto";
import { Readable, Writable } from "node:stream";
import { setTimeout as delay } from "node:timers/promises";

import { agent, ndJsonStream, PROTOCOL_VERSION, RequestError } from "@agentclientprotocol/sdk";
import type { AgentContext, McpServer, PermissionOption } from "@agentclientprotocol/sdk";

import { callMcpTool } from "./fake-agent-mcp.ts";

// A short pause between chunks lets a person see the reply grow; the fake agent stands for an
// external program and has no injected Timer.
const chunkPauseMs = 40;

/** The MCP servers each session got in `session/new`. */
const sessionMcpServers = new Map<string, McpServer[]>();

/** The `_meta` each session got in `session/new`, and its current permission mode. */
const sessionSettings = new Map<string, { meta: unknown; mode: string }>();

/** The permission modes of a session; the first is the Candidate's own, as an adapter reads it. */
const availableModes = [
  { id: "candidate-mode", name: "Режим кандидата" },
  { id: "default", name: "Default" },
  { id: "read-only", name: "Read only" },
];

/** The options of every permission request, like those of a real adapter. */
const permissionOptions: PermissionOption[] = [
  { optionId: "allow-once", name: "Разрешить", kind: "allow_once" },
  { optionId: "allow-always", name: "Разрешать всегда", kind: "allow_always" },
  { optionId: "reject-once", name: "Отклонить", kind: "reject_once" },
];

/** Resolves the waiting `/wait` turn of each session when the client cancels it. */
const cancelWaiters = new Map<string, () => void>();

async function sendChunk(client: AgentContext, sessionId: string, text: string): Promise<void> {
  await client.notify("session/update", {
    sessionId,
    update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text } },
  });
}

/** Resolves when everything written to stdout so far has reached the pipe. */
async function flushStdout(): Promise<void> {
  await new Promise<void>((resolve) => {
    process.stdout.write("", () => {
      resolve();
    });
  });
}

/** Sends «Падаю…» and exits with code 1 before the turn ends. */
async function crash(client: AgentContext, sessionId: string): Promise<never> {
  await sendChunk(client, sessionId, "Падаю…");
  await flushStdout();
  process.exit(1);
}

async function waitForCancel(client: AgentContext, sessionId: string) {
  const cancelled = Promise.withResolvers<null>();
  cancelWaiters.set(sessionId, () => {
    cancelled.resolve(null);
  });
  await sendChunk(client, sessionId, "Жду отмены…");
  await cancelled.promise;
  return { stopReason: "cancelled" as const };
}

/** Sends the reply in chunks of one word and ends the turn. */
async function reply(client: AgentContext, sessionId: string, text: string) {
  for (const word of text.split(/(?<= )/u)) {
    /* oxlint-disable eslint/no-await-in-loop -- chunks go out one after another, like a real stream */
    await sendChunk(client, sessionId, word);
    await delay(chunkPauseMs);
    /* oxlint-enable eslint/no-await-in-loop */
  }
  return { stopReason: "end_turn" as const };
}

async function echo(client: AgentContext, sessionId: string, text: string) {
  return reply(client, sessionId, `Фейковый агент получил: «${text}»`);
}

/** The session's MCP server over HTTP, from `session/new`. */
function mcpServerOf(sessionId: string) {
  const server = sessionMcpServers.get(sessionId)?.find((candidate) => "type" in candidate);
  if (server === undefined || !("type" in server) || server.type !== "http") {
    throw new Error("The session has no MCP server over HTTP");
  }
  return server;
}

/** Announces the tool call, then asks permission for it with only its id, like an adapter. */
async function askPermission(
  client: AgentContext,
  sessionId: string,
  toolCall: {
    toolCallId: string;
    title: string;
    kind: "execute" | "other";
    [field: string]: unknown;
  },
) {
  await client.notify("session/update", {
    sessionId,
    update: { sessionUpdate: "tool_call", status: "pending", ...toolCall },
  });
  const { outcome } = await client.request("session/request_permission", {
    sessionId,
    toolCall: { toolCallId: toolCall.toolCallId },
    options: permissionOptions,
  });
  return outcome;
}

async function readBrief(client: AgentContext, sessionId: string) {
  const server = mcpServerOf(sessionId);
  const outcome = await askPermission(client, sessionId, {
    toolCallId: randomUUID(),
    title: "get_brief",
    kind: "other",
    rawInput: {},
    // The structural field the server recognizes our MCP tools by.
    _meta: { fakeAgent: { mcpServer: server.name } },
  });
  if (outcome.outcome !== "selected" || outcome.optionId === "reject-once") {
    return reply(client, sessionId, "Фейковый агент не получил разрешения на get_brief");
  }
  try {
    const brief = await callMcpTool(server.url, "get_brief");
    return await reply(client, sessionId, `Фейковый агент прочитал brief: ${brief}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return reply(client, sessionId, `Фейковый агент не смог вызвать get_brief: ${message}`);
  }
}

async function askForeignTool(client: AgentContext, sessionId: string) {
  const command = "touch interview-sensei/get_brief.txt";
  const outcome = await askPermission(client, sessionId, {
    toolCallId: randomUUID(),
    // The title names the session's MCP server and tool; only structural fields may count.
    title: `mcp__${mcpServerOf(sessionId).name}__get_brief: ${command}`,
    kind: "execute",
    rawInput: { command },
  });
  if (outcome.outcome === "cancelled") {
    return { stopReason: "cancelled" as const };
  }
  const chosen = permissionOptions.find((option) => option.optionId === outcome.optionId);
  return reply(
    client,
    sessionId,
    `Фейковый агент получил ответ: «${chosen?.name ?? outcome.optionId}»`,
  );
}

// The late request waits this long after the turn ends, so the client has finished the turn.
const latePauseMs = 300;

/** Ends the turn at once; the permission request follows after the turn. */
function askAfterTurn(client: AgentContext, sessionId: string) {
  void (async () => {
    await delay(latePauseMs);
    const outcome = await askPermission(client, sessionId, {
      toolCallId: randomUUID(),
      title: "touch late.txt",
      kind: "execute",
      rawInput: { command: "touch late.txt" },
    });
    await sendChunk(client, sessionId, `Поздний запрос: ${outcome.outcome}`);
  })();
  return Promise.resolve({ stopReason: "end_turn" as const });
}

/** The prompts that do more than echo; each returns the turn's stop reason. */
const commands = new Map<
  string,
  (client: AgentContext, sessionId: string) => Promise<{ stopReason: "end_turn" | "cancelled" }>
>([
  ["/crash", crash],
  [
    "/fail",
    () => {
      throw new RequestError(-32_603, "Фейковый агент не смог ответить");
    },
  ],
  ["/wait", waitForCancel],
  ["/brief", readBrief],
  ["/permission", askForeignTool],
  ["/late", askAfterTurn],
  [
    "/mode",
    async (client, sessionId) =>
      reply(client, sessionId, `Режим: ${sessionSettings.get(sessionId)?.mode ?? "нет"}`),
  ],
  [
    "/meta",
    async (client, sessionId) =>
      reply(client, sessionId, `_meta: ${JSON.stringify(sessionSettings.get(sessionId)?.meta)}`),
  ],
  [
    "/mcp",
    async (client, sessionId) => {
      const { name, url } = mcpServerOf(sessionId);
      return reply(client, sessionId, `MCP: ${name} ${url}`);
    },
  ],
]);

const app = agent({ name: "interview-sensei-fake-agent" })
  .onRequest("initialize", () => ({
    protocolVersion: PROTOCOL_VERSION,
    agentCapabilities: { mcpCapabilities: { http: true, sse: false } },
    authMethods: [],
  }))
  .onRequest("session/new", ({ params }) => {
    const sessionId = randomUUID();
    sessionMcpServers.set(sessionId, params.mcpServers);
    const mode = availableModes[0]?.id ?? "";
    // oxlint-disable-next-line eslint/no-underscore-dangle -- `_meta` is the ACP field's name
    sessionSettings.set(sessionId, { meta: params._meta ?? null, mode });
    return { sessionId, modes: { currentModeId: mode, availableModes } };
  })
  .onRequest("session/set_mode", ({ params: { sessionId, modeId } }) => {
    const settings = sessionSettings.get(sessionId);
    if (settings === undefined || !availableModes.some((mode) => mode.id === modeId)) {
      throw RequestError.invalidParams({ modeId });
    }
    settings.mode = modeId;
    return {};
  })
  .onRequest("session/prompt", async ({ params: { sessionId, prompt }, client }) => {
    const text = prompt.map((block) => (block.type === "text" ? block.text : "")).join("");
    const command = commands.get(text);
    return command === undefined ? echo(client, sessionId, text) : command(client, sessionId);
  })
  .onNotification("session/cancel", ({ params }) => {
    cancelWaiters.get(params.sessionId)?.();
    cancelWaiters.delete(params.sessionId);
  });

const mode = process.env.INTERVIEW_SENSEI_FAKE_AGENT_MODE;
if (mode === "silent" || mode === "ignore-sigterm") {
  process.on("SIGTERM", () => {});
  // Keeps the process alive after its input ends, so only SIGKILL stops it.
  setInterval(() => {}, 60_000);
}
if (mode !== "silent") {
  app.connect(ndJsonStream(Writable.toWeb(process.stdout), Readable.toWeb(process.stdin)));
}
