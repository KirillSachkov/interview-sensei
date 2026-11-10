// Spec #45, seam 1, ticket #51: the default agent in «Настройки». A Target without its own agent
// takes the default agent; without the setting it takes the first available agent, as in #42.
import path from "node:path";

import { describe, expect, it, onTestFinished } from "vitest";

import { fixedTime, temporaryDirectory } from "./chat-test-support.ts";
import { demoApi } from "./model-test-support.ts";
import { buildServer } from "./server.ts";

/**
 * A server that offers Claude Code, Codex and OpenCode from an empty temporary home, with the
 * demo Target: Claude Code is available there, Codex and OpenCode are not. No agent starts.
 */
async function serverWithRealAgents() {
  const home = await temporaryDirectory();
  const server = await buildServer({
    clock: { now: () => new Date(fixedTime) },
    timer: { repeat: () => () => {}, after: () => () => {} },
    dataDirectory: path.join(home, ".interview-sensei"),
    userEnvironment: { home, env: { PATH: path.join(home, "bin") } },
  });
  onTestFinished(async () => server.close());
  // The server does not listen: in process the page's origin is inject's default host.
  const headers = { origin: "http://localhost" };
  const created = await server.inject({ method: "POST", url: "/api/targets/demo", headers });
  const { id } = created.json<{ id: string }>();
  return {
    setDefault: async (agent: unknown) =>
      server.inject({
        method: "PUT",
        url: "/api/settings/default-agent",
        headers,
        payload: { agent },
      }),
    setTargetAgent: async (agent: string) =>
      server.inject({
        method: "PUT",
        url: `/api/targets/${id}/agent`,
        headers,
        payload: { agent },
      }),
    settings: async () => server.inject({ url: "/api/settings" }),
    targetAgent: async () => server.inject({ url: `/api/targets/${id}/agent` }),
  };
}

describe("default agent", () => {
  it("has no default agent until the Candidate chooses one", async () => {
    const api = await serverWithRealAgents();

    const response = await api.settings();

    expect(response.statusCode).toBe(200);
    expect(response.json()).toStrictEqual({ defaultAgent: null, fillInBackground: false });
  });

  it("gives a Target without its own agent the default agent", async () => {
    const api = await serverWithRealAgents();

    const response = await api.setDefault("codex");

    expect(response.statusCode).toBe(200);
    expect(response.json()).toStrictEqual({ defaultAgent: "codex", fillInBackground: false });
    const agent = await api.targetAgent();
    expect(agent.json()).toStrictEqual({ agent: "codex", chosen: false });
  });

  it("keeps the Target's own agent over the default agent", async () => {
    const api = await serverWithRealAgents();
    await api.setTargetAgent("opencode");

    await api.setDefault("codex");

    const agent = await api.targetAgent();
    expect(agent.json()).toStrictEqual({ agent: "opencode", chosen: true });
  });

  it("returns a Target to the first available agent when the default is cleared", async () => {
    const api = await serverWithRealAgents();
    await api.setDefault("codex");

    const response = await api.setDefault(null);

    expect(response.json()).toStrictEqual({ defaultAgent: null, fillInBackground: false });
    const agent = await api.targetAgent();
    expect(agent.json()).toStrictEqual({ agent: "claude", chosen: false });
  });

  it.each([
    ["an agent the server does not offer", { agent: "gpt" }],
    ["a number", { agent: 3 }],
    ["an empty body", {}],
    ["an extra field", { agent: "codex", extra: true }],
  ])("rejects %s with 400", async (_case, payload) => {
    const api = await demoApi();

    const response = await api.put("/api/settings/default-agent", payload);

    expect(response.statusCode).toBe(400);
    expect(response.json()).toStrictEqual({ error: "unknown_agent" });
  });

  it("keeps the default agent after a server restart", async () => {
    const directory = await temporaryDirectory();
    const api = await demoApi(directory);
    await api.put("/api/settings/default-agent", { agent: "fake" });
    await api.stop();

    const restarted = await demoApi(directory);
    const response = await restarted.get("/api/settings");

    expect(response.json()).toStrictEqual({ defaultAgent: "fake", fillInBackground: false });
  });
});
