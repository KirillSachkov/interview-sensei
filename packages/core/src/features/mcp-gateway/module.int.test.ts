// The MCP gateway module on the real MCP SDK, in process: each session's address serves the tool
// set of its kind.
import { describe, expect, it } from "vitest";
import { z } from "zod";

import { sessionTool } from "../../shared/mcp/index.ts";
import type { McpGateway } from "./application/mcp-gateway.ts";
import { mcpGatewayModule } from "./module.ts";

const origin = "http://127.0.0.1:4310";

const ping = sessionTool({
  name: "ping",
  description: "Answers pong.",
  input: z.object({}),
  run: () => Promise.resolve("pong"),
});

/** The JSON-RPC message of the response: the body itself, or the first SSE `data:` line. */
async function responseMessage(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!(response.headers.get("content-type") ?? "").includes("text/event-stream")) {
    return JSON.parse(text);
  }
  const data = text.split("\n").find((line) => line.startsWith("data:"));
  return data === undefined ? undefined : JSON.parse(data.slice("data:".length));
}

/** The tool names that the session's address lists over MCP. */
async function listedTools(gateway: McpGateway, session: { sessionId: string; kind: string }) {
  const { url } = gateway.open(session);
  const endpoint = gateway.endpoint(url.slice(`${origin}/mcp/`.length));
  if (endpoint === undefined) {
    throw new Error("The opened address has no endpoint");
  }
  const post = async (message: object) => {
    const body = { jsonrpc: "2.0", ...message };
    const request = new Request(url, {
      method: "POST",
      headers: {
        // The SDK refuses a request without a loopback Host, as against DNS rebinding.
        host: new URL(origin).host,
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        "mcp-protocol-version": "2025-06-18",
      },
      body: JSON.stringify(body),
    });
    return endpoint.handle(request, body);
  };
  await post({
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "test", version: "0" },
    },
  });
  await post({ method: "notifications/initialized" });
  const message = await responseMessage(await post({ id: 2, method: "tools/list" }));
  // An MCP server without tools offers no `tools/list`: the method is not found.
  const listed = z
    .union([
      z.object({ result: z.object({ tools: z.array(z.object({ name: z.string() })) }) }),
      z.object({ error: z.object({ code: z.literal(-32_601) }) }),
    ])
    .parse(message);
  return "result" in listed ? listed.result.tools.map(({ name }) => name) : [];
}

describe("mcp gateway module", () => {
  const gateway = mcpGatewayModule({
    tools: { "service-chat": [ping] },
    origin: () => origin,
    onError: () => {},
  });

  it("serves a session the tool set of its kind", async () => {
    await expect(
      listedTools(gateway, { sessionId: "s-1", kind: "service-chat" }),
    ).resolves.toStrictEqual(["ping"]);
  });

  it("serves a session of an unknown kind no tools", async () => {
    await expect(
      listedTools(gateway, { sessionId: "s-2", kind: "unknown" }),
    ).resolves.toStrictEqual([]);
  });
});
