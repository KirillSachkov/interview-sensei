import { fastify } from "fastify";
import { onTestFinished } from "vitest";

import { browserHeaders, fixedTime, startServer, temporaryDirectory } from "./chat-test-support.ts";
import type { ServerOptions } from "./chat-test-support.ts";
import { composeFeatures, mcpGatewayModule } from "./composition.ts";
import type { Features } from "./composition.ts";

export type TargetView = NonNullable<Awaited<ReturnType<Features["targets"]["get"]>>>;
export type Questions = Awaited<ReturnType<Features["questionBank"]["search"]>>;

export function first<Item>(items: readonly Item[]): Item {
  const [item] = items;
  if (item === undefined) {
    throw new Error("Expected at least one item");
  }
  return item;
}

export async function demoApi(dataDirectory?: string, options: ServerOptions = {}) {
  const started = await startServer(dataDirectory ?? (await temporaryDirectory()), options);
  const { server } = started;
  const headers = browserHeaders(server);
  const createDemo = async () =>
    server.inject({ method: "POST", url: "/api/targets/demo", headers });
  const created = await createDemo();
  const target = created.json<TargetView>();
  const get = async (url: string) => server.inject({ url, headers });
  const put = async (url: string, payload: object) =>
    server.inject({ method: "PUT", url, headers, payload });
  const questions = async (query = ""): Promise<Questions> => {
    const response = await get(`/api/targets/${target.id}/questions${query}`);
    return response.json<Questions>();
  };
  return { ...started, headers, created, target, createDemo, get, put, questions };
}

export async function model() {
  const features = await composeFeatures({
    dataDirectory: await temporaryDirectory(),
    // These tests start no agent, so no skill is read.
    skillsDirectory: await temporaryDirectory(),
    clock: { now: () => new Date(fixedTime) },
    timer: { repeat: () => () => {}, after: () => () => {} },
    fakeAgent: true,
    userEnvironment: undefined,
    origin: () => "http://127.0.0.1:4399",
    log: fastify().log,
  });
  onTestFinished(async () => {
    await features.sessions.close();
    await features.storage.close();
  });
  return features;
}

/** Runs the exported tools through the real MCP transport; production service-chat stays unchanged. */
export function modelClient(features: Features, targetId?: string) {
  const origin = "http://127.0.0.1:4399";
  const sessionId = crypto.randomUUID();
  const gateway = mcpGatewayModule({
    tools: {
      "service-chat": Object.values(features.modelTools),
      "target-setup": [],
      "mock-interview": [],
      "side-thread": [],
    },
    origin: () => origin,
    onError: () => {},
  });
  const { url } = gateway.open({
    sessionId,
    kind: "service-chat",
    ...(targetId === undefined ? {} : { targetId }),
  });
  const endpoint = gateway.endpoint(url.slice(`${origin}/mcp/`.length));
  if (endpoint === undefined) {
    throw new Error("Missing MCP endpoint");
  }
  onTestFinished(async () => gateway.close(sessionId));
  return async (name: string, args: object = {}) => {
    const body = { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } };
    const response = await endpoint.handle(
      new Request(url, {
        method: "POST",
        headers: {
          host: new URL(origin).host,
          "content-type": "application/json",
          accept: "application/json, text/event-stream",
          "mcp-protocol-version": "2025-06-18",
        },
        body: JSON.stringify(body),
      }),
      body,
    );
    const text = await response.text();
    const data = text.split("\n").find((line) => line.startsWith("data:"));
    return toolReply(JSON.parse(data === undefined ? text : data.slice(5)));
  };
}

function toolReply(message: unknown): { text: string; isError: boolean } {
  if (typeof message !== "object" || message === null || !("result" in message)) {
    throw new Error("Missing MCP tool result");
  }
  const { result } = message;
  if (
    typeof result !== "object" ||
    result === null ||
    !("content" in result) ||
    !Array.isArray(result.content)
  ) {
    throw new Error("Missing MCP content");
  }
  const text: unknown = result.content[0];
  if (
    typeof text !== "object" ||
    text === null ||
    !("text" in text) ||
    typeof text.text !== "string"
  ) {
    throw new Error("Missing MCP text");
  }
  return { text: text.text, isError: "isError" in result && result.isError === true };
}
