// PROTOTYPE, throwaway. Answers issue #4: Fastify as ACP client -> WS -> browser chat,
// with our own MCP server (streamable HTTP) passed to the agent in session/new.
// Run: node server.mjs --agent claude|codex|opencode [--port 4710]
import { spawn } from "node:child_process";
import { Readable, Writable } from "node:stream";
import { readFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import Fastify from "fastify";
import websocket from "@fastify/websocket";
import * as acp from "@agentclientprotocol/sdk/unstable";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";

const here = path.dirname(fileURLToPath(import.meta.url));
const args = Object.fromEntries(
  process.argv.slice(2).join(" ").split("--").filter(Boolean).map((s) => s.trim().split(/\s+/)),
);
const AGENT = args.agent ?? "claude";
const PORT = Number(args.port ?? 4710);
const T0 = Date.now();
const t = () => `+${((Date.now() - T0) / 1000).toFixed(2)}s`;
const log = (...a) => console.log(t(), ...a);

const AGENTS = {
  claude: [path.join(here, "node_modules/.bin/claude-agent-acp"), []],
  codex: [path.join(here, "node_modules/.bin/codex-acp"), []],
  opencode: ["opencode", ["acp"]],
};

// ---------- browser sockets ----------
const sockets = new Set();
const push = (ev) => {
  const s = JSON.stringify(ev);
  for (const ws of sockets) ws.send(s);
};
const pendingPermissions = new Map(); // id -> resolve

// ---------- our MCP server ----------
const questions = [];
const mcpCalls = [];
function buildMcp() {
  const mcp = new McpServer({ name: "interview-sensei-proto", version: "0.0.0" });
  mcp.registerTool(
    "get_session_brief",
    { description: "Return the brief for the current interview session.", inputSchema: {} },
    async () => {
      mcpCalls.push({ tool: "get_session_brief", at: t() });
      log("MCP <- get_session_brief");
      push({ type: "mcp_call", tool: "get_session_brief", at: t() });
      return {
        content: [{ type: "text", text: "Brief: candidate prepares for a Middle Go backend interview. Topic: goroutines and channels. Ask one question at a time." }],
      };
    },
  );
  mcp.registerTool(
    "present_question",
    {
      description: "Show one interview question to the candidate as a card in the UI.",
      inputSchema: { topic: z.string(), question: z.string() },
    },
    async ({ topic, question }) => {
      const q = { id: questions.length + 1, topic, question };
      questions.push(q);
      mcpCalls.push({ tool: "present_question", at: t(), q });
      log("MCP <- present_question", q);
      push({ type: "question_card", ...q, at: t() });
      return { content: [{ type: "text", text: `Question ${q.id} shown to the candidate.` }] };
    },
  );
  return mcp;
}

// ---------- Fastify ----------
const app = Fastify();
await app.register(websocket);
app.get("/", (_, reply) => reply.type("text/html").send(readFileSync(path.join(here, "index.html"))));
app.get("/state", () => ({ agent: AGENT, initInfo, sessionId, questions, mcpCalls, forkResult }));

// Stateless streamable HTTP: one McpServer + transport per request.
app.all("/mcp", async (req, reply) => {
  log("MCP http", req.method, req.body?.method ?? "", req.headers["user-agent"] ?? "");
  if (req.method !== "POST") return reply.code(405).send({ error: "stateless: POST only" });
  const mcp = buildMcp();
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  reply.hijack();
  reply.raw.on("close", () => { transport.close(); mcp.close(); });
  await mcp.connect(transport);
  await transport.handleRequest(req.raw, reply.raw, req.body);
});

app.register(async (f) => {
  f.get("/ws", { websocket: true }, (ws) => {
    sockets.add(ws);
    ws.send(JSON.stringify({ type: "hello", agent: AGENT, initInfo, sessionId }));
    ws.on("close", () => sockets.delete(ws));
    ws.on("message", async (raw) => {
      const msg = JSON.parse(raw.toString());
      if (msg.type === "prompt") runPrompt(msg.text, msg.sessionId ?? sessionId);
      if (msg.type === "permission") pendingPermissions.get(msg.id)?.(msg.optionId);
      if (msg.type === "fork") doFork();
      if (msg.type === "cancel") agentCtx.notify("session/cancel", { sessionId });
    });
  });
});

await app.listen({ port: PORT, host: "127.0.0.1" });
const MCP_URL = `http://127.0.0.1:${PORT}/mcp`;
log(`HTTP on http://127.0.0.1:${PORT}, MCP at ${MCP_URL}, agent=${AGENT}`);

// ---------- ACP client ----------
const [cmd, cmdArgs] = AGENTS[AGENT];
const child = spawn(cmd, cmdArgs, { stdio: ["pipe", "pipe", "pipe"], env: process.env });
child.stderr.on("data", (d) => process.stderr.write(`[agent stderr] ${d}`));
child.on("exit", (code, sig) => { log("agent exited", code, sig); push({ type: "agent_exit", code, sig }); });
const stream = acp.ndJsonStream(Writable.toWeb(child.stdin), Readable.toWeb(child.stdout));

let promptStartedAt = 0;
let firstChunkSeen = false;
// Lesson from run codex2: a regex over the whole toolCall gave false positives (cwd path
// contains "interview-sensei") and false negatives (codex MCP approvals carry no title).
// Match structurally, falling back to the earlier tool_call with the same id.
const toolCalls = new Map(); // toolCallId -> last seen tool_call/update
const OUR = "interview-sensei";
const isOurTool = (tc) => {
  const seen = { ...(toolCalls.get(tc?.toolCallId) ?? {}), ...(tc ?? {}) };
  return (
    seen._meta?.claudeCode?.mcpServer?.name === OUR || // claude-agent-acp
    String(seen.title ?? "").startsWith(`mcp__${OUR}__`) || // claude
    seen.rawInput?.server === OUR || // codex-acp (rawInput of the earlier tool_call)
    String(seen.title ?? "").startsWith(`mcp.${OUR}.`) || // codex title
    String(seen.title ?? "").startsWith(`${OUR}_`) // opencode: <server>_<tool>
  );
};

const clientApp = acp
  .client({ name: "interview-sensei-proto" })
  .onNotification("session/update", (c) => { try { onUpdate(c.params); } catch (e) { log("update handler error", e.stack); } })
  .onRequest("session/request_permission", async (c) => onPermission(c.params))
  .onRequest("*", async (c) => {
    log("unhandled client request", c.method, JSON.stringify(c.params).slice(0, 300));
    throw new Error("not supported");
  });

function onUpdate(n) {
    const u = n.update;
    if (u.toolCallId) toolCalls.set(u.toolCallId, { ...(toolCalls.get(u.toolCallId) ?? {}), ...u });
    if (!firstChunkSeen && u.sessionUpdate === "agent_message_chunk") {
      firstChunkSeen = true;
      log(`first agent_message_chunk after ${Date.now() - promptStartedAt} ms`);
    }
    if (u.sessionUpdate !== "agent_message_chunk" && u.sessionUpdate !== "agent_thought_chunk")
      log("update", u.sessionUpdate, JSON.stringify(u).slice(0, 300));
    push({ type: "update", sessionId: n.sessionId, update: u });
}

async function onPermission(p) {
    log("permission request", JSON.stringify(p).slice(0, 500));
    const opts = p.options ?? [];
    if (isOurTool(p.toolCall)) {
      const allow = opts.find((o) => o.kind === "allow_once") ?? opts.find((o) => o.kind?.startsWith("allow"));
      log("auto-allow our MCP tool ->", allow?.optionId);
      push({ type: "permission_auto", toolCall: p.toolCall, optionId: allow?.optionId });
      return { outcome: { outcome: "selected", optionId: allow.optionId } };
    }
    const id = Math.random().toString(36).slice(2);
    push({ type: "permission", id, toolCall: p.toolCall, options: opts });
    const optionId = await new Promise((r) => pendingPermissions.set(id, r));
    pendingPermissions.delete(id);
    if (!optionId) return { outcome: { outcome: "cancelled" } };
    return { outcome: { outcome: "selected", optionId } };
}

let agentCtx;
const MODE = args.mode; // e.g. --mode default to force permission prompts
let initInfo;
let sessionId;
let forkResult = null;
const cwd = path.join(here, ".scratch-cwd");
mkdirSync(cwd, { recursive: true });

async function runPrompt(text, sid) {
  promptStartedAt = Date.now();
  firstChunkSeen = false;
  log("prompt ->", sid, text);
  push({ type: "user", text, sessionId: sid });
  try {
    const res = await agentCtx.request("session/prompt", { sessionId: sid, prompt: [{ type: "text", text }] });
    log(`prompt done stopReason=${res.stopReason} in ${Date.now() - promptStartedAt} ms`);
    push({ type: "stop", sessionId: sid, stopReason: res.stopReason, ms: Date.now() - promptStartedAt });
  } catch (e) {
    log("prompt error", e?.message, JSON.stringify(e?.data ?? e));
    push({ type: "error", where: "prompt", message: e?.message, data: e?.data });
  }
}

async function doFork() {
  try {
    const r = await agentCtx.request("session/fork", { sessionId, cwd, mcpServers: mcpServers() });
    forkResult = { ok: true, r };
    log("fork ok", JSON.stringify(r));
    push({ type: "fork", ok: true, result: r });
  } catch (e) {
    forkResult = { ok: false, message: e?.message, data: e?.data };
    log("fork error", e?.message, JSON.stringify(e?.data ?? ""));
    push({ type: "fork", ok: false, message: e?.message });
  }
}

const mcpServers = () => {
  const http = initInfo?.agentCapabilities?.mcpCapabilities?.http;
  return http
    ? [{ type: "http", name: "interview-sensei", url: MCP_URL, headers: [] }]
    : // fallback: stdio bridge would be needed; record it
      [{ type: "http", name: "interview-sensei", url: MCP_URL, headers: [] }];
};

clientApp
  .connectWith(stream, async (ctx) => {
    agentCtx = ctx;
    const t1 = Date.now();
    initInfo = await ctx.request("initialize", {
      protocolVersion: acp.PROTOCOL_VERSION,
      clientCapabilities: { fs: { readTextFile: false, writeTextFile: false }, terminal: false },
      clientInfo: { name: "interview-sensei-proto", version: "0.0.0" },
    });
    log(`initialize ${Date.now() - t1} ms`);
    log("INIT", JSON.stringify(initInfo, null, 2));
    const t2 = Date.now();
    try {
      const s = await ctx.request("session/new", { cwd, mcpServers: mcpServers() });
      sessionId = s.sessionId;
      log(`session/new ${Date.now() - t2} ms`, JSON.stringify(s).slice(0, 1500));
      if (MODE) { await ctx.request("session/set_mode", { sessionId, modeId: MODE }); log("set_mode", MODE); }
      push({ type: "session", sessionId, modes: s.modes, models: s.models, configOptions: s.configOptions });
    } catch (e) {
      log("session/new error", e?.message, JSON.stringify(e?.data ?? e));
      push({ type: "error", where: "session/new", message: e?.message, data: e?.data });
    }
    await new Promise(() => {}); // keep connection open
  })
  .catch((e) => log("connection closed", e?.message));

const shutdown = () => { child.kill("SIGTERM"); app.close(); setTimeout(() => process.exit(0), 500); };
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
