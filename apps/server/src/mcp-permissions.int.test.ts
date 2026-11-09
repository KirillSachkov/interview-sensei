// The session's own MCP address and the agent's permission requests through the server's HTTP and
// WebSocket API, with real PGlite and the fake ACP agent as a separate process.
import type { FastifyInstance } from "fastify";
import { describe, expect, it } from "vitest";

import {
  agentTexts,
  isIdle,
  readyChat,
  startServer,
  temporaryDirectory,
} from "./chat-test-support.ts";
import type { SessionView } from "./chat-test-support.ts";

/** Posts one JSON-RPC message of the 2025-06-18 revision to the MCP address. */
async function postMcp(url: string, message: object) {
  return fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      "mcp-protocol-version": "2025-06-18",
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, ...message }),
  });
}

/** The JSON-RPC answer of a response with a JSON or an SSE body. */
async function answerOf(response: Response): Promise<unknown> {
  const body = await response.text();
  const data = body.split("\n").find((line) => line.startsWith("data:"));
  return JSON.parse(data === undefined ? body : data.slice("data:".length));
}

/** The answer of the MCP address to `tools/list`. */
async function toolList(url: string): Promise<unknown> {
  const response = await postMcp(url, { method: "tools/list", params: {} });
  expect(response.status).toBe(200);
  return answerOf(response);
}

/** The HTTP status the MCP address answers `tools/list` with. */
async function mcpStatus(url: string): Promise<number> {
  const response = await postMcp(url, { method: "tools/list" });
  return response.status;
}

/** Only `get_brief`: the tool set of the service chat. */
const serviceChatTools = { result: { tools: [{ name: "get_brief" }] } };

const briefReply = "Фейковый агент прочитал brief:";

const lastAgentText = (view: SessionView) => agentTexts(view).at(-1) ?? "";
const isBriefRead = (view: SessionView) =>
  isIdle(view) && lastAgentText(view).startsWith(briefReply);
const permissionRequests = (view: SessionView) =>
  view.entries.filter((entry) => entry.type === "permission_request");
const hasAnswered = (reply: string) => (view: SessionView) =>
  isIdle(view) && lastAgentText(view) === reply;
const isStopped = (view: SessionView) =>
  isIdle(view) && view.entries.some((entry) => entry.type === "turn_interrupted");
const hasMcpUrl = (view: SessionView) => isIdle(view) && lastAgentText(view).startsWith("MCP: ");
/** Starts a chat and reads its MCP server from the fake agent's reply `MCP: <name> <url>`. */
async function chatWithMcpUrl(server: FastifyInstance) {
  const { sessionId, events } = await readyChat(server);
  events.send({ type: "prompt", text: "/mcp" });
  const [name = "", url = ""] = lastAgentText(await events.waitFor(hasMcpUrl))
    .slice("MCP: ".length)
    .split(" ");
  return { sessionId, events, name, url };
}

const isAskingPermission = (view: SessionView) =>
  permissionRequests(view).some((entry) => entry.answer === null);

describe("mcp and permissions", () => {
  it("lets the agent call get_brief on the session's MCP address without asking the Candidate", async () => {
    const { server } = await startServer(await temporaryDirectory());
    const { events } = await readyChat(server);

    events.send({ type: "prompt", text: "/brief" });

    const answered = await events.waitFor(isBriefRead);
    expect(lastAgentText(answered)).toContain("Interview Sensei service chat");
    expect(events.views.flatMap((view) => permissionRequests(view))).toStrictEqual([]);
  });

  it("passes a foreign tool's permission request to the browser and the Candidate's answer to the agent", async () => {
    const { server } = await startServer(await temporaryDirectory());
    const { events } = await readyChat(server);

    events.send({ type: "prompt", text: "/permission" });

    const asking = await events.waitFor(isAskingPermission);
    const [request] = permissionRequests(asking);
    // The title names the session's MCP server and tool, but only structural fields mark our tools.
    expect(request?.title).toMatch(
      /^mcp__interview-sensei-[0-9a-f]{8}__get_brief: touch interview-sensei\/get_brief\.txt$/u,
    );
    expect({ status: asking.status, request }).toMatchObject({
      status: "working",
      request: {
        input: "touch interview-sensei/get_brief.txt",
        options: [
          { optionId: "allow-once", name: "Разрешить", kind: "allow_once" },
          { optionId: "allow-always", name: "Разрешать всегда", kind: "allow_always" },
          { optionId: "reject-once", name: "Отклонить", kind: "reject_once" },
        ],
        answer: null,
      },
    });
    events.send({ type: "permission", requestId: request?.requestId, optionId: "reject-once" });

    const answered = await events.waitFor(hasAnswered("Фейковый агент получил ответ: «Отклонить»"));
    expect(permissionRequests(answered)).toMatchObject([
      { answer: { outcome: "selected", optionId: "reject-once" } },
    ]);
  });

  it("answers a waiting permission request with cancelled when the Candidate stops the turn", async () => {
    const { server } = await startServer(await temporaryDirectory());
    const { events } = await readyChat(server);
    events.send({ type: "prompt", text: "/permission" });
    await events.waitFor(isAskingPermission);

    events.send({ type: "cancel" });

    const stopped = await events.waitFor(isStopped);
    expect(permissionRequests(stopped)).toMatchObject([{ answer: { outcome: "cancelled" } }]);
  });

  it("answers cancelled at once to a permission request that comes after the turn", async () => {
    const { server } = await startServer(await temporaryDirectory());
    const { events } = await readyChat(server);

    events.send({ type: "prompt", text: "/late" });

    const answered = await events.waitFor(
      (view) => lastAgentText(view) === "Поздний запрос: cancelled",
    );
    expect(permissionRequests(answered)).toStrictEqual([]);
  });

  it("refuses an answer to a request that no longer waits", async () => {
    const { server } = await startServer(await temporaryDirectory());
    const { events } = await readyChat(server);

    events.send({ type: "permission", requestId: "unknown", optionId: "allow-once" });

    await expect(events.nextReply()).resolves.toStrictEqual({
      type: "permission_rejected",
      reason: "not_found",
    });
  });

  it("gives each session its own MCP address with the tools of its kind", async () => {
    const { server } = await startServer(await temporaryDirectory());
    const first = await chatWithMcpUrl(server);
    const second = await chatWithMcpUrl(server);

    expect(first.url).not.toBe(second.url);
    // A server of the same name in the Candidate's agent config cannot pass for ours.
    expect(`${first.name} ${second.name}`).toMatch(
      /^interview-sensei-(?<suffix>[0-9a-f]{8}) interview-sensei-(?!\k<suffix>)[0-9a-f]{8}$/u,
    );
    // The address does not follow from the session id, which the browser API shows.
    expect(first.url).not.toContain(first.sessionId);
    await expect(toolList(first.url)).resolves.toMatchObject(serviceChatTools);
    await expect(mcpStatus(new URL(`/mcp/${first.sessionId}`, first.url).href)).resolves.toBe(404);
  });

  it("gives the agent an IPv6 loopback MCP address when the server listens on ::1", async () => {
    const { server } = await startServer(await temporaryDirectory(), { host: "::1" });
    const { url } = await chatWithMcpUrl(server);

    const [address] = server.addresses();
    expect(url).toMatch(new RegExp(`^http://\\[::1\\]:${address?.port}/mcp/`, "u"));
    await expect(toolList(url)).resolves.toMatchObject(serviceChatTools);
  });

  it("gives the agent an IPv4 loopback MCP address when the server listens on localhost", async () => {
    const { server } = await startServer(await temporaryDirectory(), { host: "localhost" });
    const { url } = await chatWithMcpUrl(server);

    const ports = new Set(server.addresses().map((address) => address.port));
    expect(ports.size).toBe(1);
    expect(url).toMatch(new RegExp(`^http://127\\.0\\.0\\.1:${[...ports].join("")}/mcp/`, "u"));
    await expect(toolList(url)).resolves.toMatchObject(serviceChatTools);
  });

  it("rejects the MCP address of a session whose agent is gone and keeps the others", async () => {
    const { server } = await startServer(await temporaryDirectory());
    const gone = await chatWithMcpUrl(server);
    const kept = await chatWithMcpUrl(server);

    gone.events.send({ type: "prompt", text: "/crash" });
    await gone.events.waitFor((view) => view.status === "failed");

    await expect(mcpStatus(gone.url)).resolves.toBe(404);
    await expect(toolList(kept.url)).resolves.toMatchObject(serviceChatTools);
  });
});
