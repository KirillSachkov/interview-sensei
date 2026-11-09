// The fake ACP agent: tests and manual checks run it instead of a real agent, which needs a
// subscription and the network. Run as `node fake-agent.ts`; it speaks ACP over stdio.
//
// Prompts:
// - `/wait` sends «Жду отмены…» and waits until the client cancels the turn.
// - `/crash` sends «Падаю…» and exits with code 1 in the middle of the turn.
// - `/fail` answers the prompt with a JSON-RPC error and keeps running.
// - `/brief` asks permission to call `get_brief` of our MCP server, then calls it over HTTP and
//   replies «Фейковый агент прочитал brief: <brief>». The server allows the call by itself.
// - `/tool <name> <json>` calls a tool of our MCP server the same way; see `fake-agent-tool.ts`.
// - `/permission` asks permission for a foreign shell command whose title names the session's MCP
//   server and tool, then replies with the chosen option: «Фейковый агент получил ответ: «<name>»».
// - `/late` ends the turn, then asks permission for a foreign command outside any turn and sends
//   «Поздний запрос: <outcome>» when the answer comes.
// - `/mcp` replies with the session's MCP server: «MCP: <name> <url>».
// - `/mode` replies with the session's permission mode: «Режим: <id>». A new session starts in
//   `candidate-mode`, which stands for the mode in the Candidate's own settings.
// - `/meta` replies with the `_meta` of `session/new` as JSON: «_meta: <json>».
// - `/env` replies with the sorted names of its environment variables as JSON: «env: <json>».
// - `/markdown` replies with Markdown: bold, inline code, a list, a code block, a table, a link,
//   raw HTML, a `javascript:` link and a remote image.
// - `/system`, `/skills` and `/tools` reply with the role, skills and bans of the session's
//   profile; see `fake-agent-profile.ts`.
// - The template messages of a mock interview get the interviewer's turns of `fake-agent-interviewer.ts`.
// - The opening of an Inbox processing gets the processor's turn of `fake-agent-inbox.ts`.
// - Any other text gets the reply «Фейковый агент получил: «<text>»» in several chunks.
//
// The variable INTERVIEW_SENSEI_FAKE_AGENT_MODE stands for broken agents in launcher tests:
// - `silent` never answers and ignores SIGTERM, like a hung agent.
// - `ignore-sigterm` works but ignores SIGTERM, so only SIGKILL stops it.
// - `no-session-capabilities` takes neither a system prompt nor additional directories.
// - `mode-config-option` offers its modes only as the config option `mode`; see
//   `fake-agent-modes.ts`.
import { randomUUID } from "node:crypto";
import { Readable, Writable } from "node:stream";
import { setTimeout as delay } from "node:timers/promises";

// The unstable entry reads the ACP `systemPrompt` of `session/new`, as the adapters do.
import {
  agent,
  ndJsonStream,
  PROTOCOL_VERSION,
  RequestError,
} from "@agentclientprotocol/sdk/unstable";
import type { AgentContext, McpServer } from "@agentclientprotocol/sdk/unstable";

import { templateTurn } from "./fake-agent-templates.ts";
import { callBrief, callTool, toolCommand } from "./fake-agent-tool.ts";
import type { ToolCall } from "./fake-agent-tool.ts";
import { fakeAgentModes } from "./fake-agent-modes.ts";
import { askPermission, permissionOptions } from "./fake-agent-permission.ts";
import { profileReply, profileSettings, sessionCapabilities } from "./fake-agent-profile.ts";
import type { ProfileSettings } from "./fake-agent-profile.ts";
import { markdownSample, sendChunk, sendText } from "./fake-agent-text.ts";

/** The MCP servers each session got in `session/new`. */
const sessionMcpServers = new Map<string, McpServer[]>();

/** What each session got in `session/new`. */
const sessionSettings = new Map<string, ProfileSettings>();

const agentMode = process.env.INTERVIEW_SENSEI_FAKE_AGENT_MODE;
const modes = fakeAgentModes(agentMode);

/** Resolves the waiting `/wait` turn of each session when the client cancels it. */
const cancelWaiters = new Map<string, () => void>();

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
  await sendText(client, sessionId, text);
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

/** How the fake agent calls our MCP tools in the session: on its server, after asking permission. */
function toolAccess(client: AgentContext, sessionId: string) {
  const ask = async (call: ToolCall) => askPermission(client, sessionId, call);
  return { server: mcpServerOf(sessionId), ask };
}

async function readBrief(client: AgentContext, sessionId: string) {
  return reply(client, sessionId, await callBrief(toolAccess(client, sessionId)));
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
  ["/markdown", async (client, sessionId) => reply(client, sessionId, markdownSample)],
  [
    "/mode",
    async (client, sessionId) =>
      reply(client, sessionId, `Режим: ${modes.current(sessionId) ?? "нет"}`),
  ],
  [
    "/meta",
    async (client, sessionId) =>
      reply(client, sessionId, `_meta: ${JSON.stringify(sessionSettings.get(sessionId)?.meta)}`),
  ],
  [
    "/env",
    async (client, sessionId) =>
      reply(client, sessionId, `env: ${JSON.stringify(Object.keys(process.env).toSorted())}`),
  ],
  [
    "/mcp",
    async (client, sessionId) => {
      const { name, url } = mcpServerOf(sessionId);
      return reply(client, sessionId, `MCP: ${name} ${url}`);
    },
  ],
]);

/** Runs `/tool` or one of `commands`; echoes any other text. */
async function respond(client: AgentContext, sessionId: string, text: string) {
  const tool = toolCommand(text);
  if (tool === null) {
    const command = commands.get(text);
    return command === undefined ? echo(client, sessionId, text) : command(client, sessionId);
  }
  return reply(client, sessionId, await callTool(tool, toolAccess(client, sessionId)));
}

const app = agent({ name: "interview-sensei-fake-agent" })
  .onRequest("initialize", () => ({
    protocolVersion: PROTOCOL_VERSION,
    agentCapabilities: {
      mcpCapabilities: { http: true, sse: false },
      ...sessionCapabilities(agentMode),
    },
    authMethods: [],
  }))
  .onRequest("session/new", ({ params }) => {
    const sessionId = randomUUID();
    sessionMcpServers.set(sessionId, params.mcpServers);
    sessionSettings.set(sessionId, profileSettings(params));
    return { sessionId, ...modes.start(sessionId) };
  })
  .onRequest("session/set_mode", ({ params }) => {
    modes.set(params);
    return {};
  })
  .onRequest("session/set_config_option", ({ params }) => ({ configOptions: modes.set(params) }))
  .onRequest("session/prompt", async ({ params: { sessionId, prompt }, client }) => {
    const text = prompt.map((block) => (block.type === "text" ? block.text : "")).join("");
    const profile = profileReply(text, sessionSettings.get(sessionId));
    if (profile !== null) {
      return reply(client, sessionId, await profile);
    }
    const interview = templateTurn(text);
    if (interview !== null) {
      return interview({ client, sessionId, server: mcpServerOf(sessionId) });
    }
    return respond(client, sessionId, text);
  })
  .onNotification("session/cancel", ({ params }) => {
    cancelWaiters.get(params.sessionId)?.();
    cancelWaiters.delete(params.sessionId);
  });

if (agentMode === "silent" || agentMode === "ignore-sigterm") {
  process.on("SIGTERM", () => {});
  // Keeps the process alive after its input ends, so only SIGKILL stops it.
  setInterval(() => {}, 60_000);
}
if (agentMode !== "silent") {
  app.connect(ndJsonStream(Writable.toWeb(process.stdout), Readable.toWeb(process.stdin)));
}
