// The Target's agent: the Candidate's choice through PUT /api/targets/:id/agent, or the default
// agent, the first available one, while the Target has no choice.
import path from "node:path";

import { describe, expect, it, onTestFinished } from "vitest";

import { fixedTime, temporaryDirectory } from "./chat-test-support.ts";
import { demoApi } from "./model-test-support.ts";
import { buildServer } from "./server.ts";

const unknownTarget = "00000000-0000-4000-8000-000000000099";

/**
 * A server that offers Claude Code, Codex and OpenCode from an empty temporary home: Claude Code
 * is available there, Codex and OpenCode are not. No agent starts.
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
  const putAgent = async (agent: unknown) =>
    server.inject({ method: "PUT", url: `/api/targets/${id}/agent`, headers, payload: { agent } });
  const getAgent = async () => server.inject({ url: `/api/targets/${id}/agent` });
  return { putAgent, getAgent };
}

describe("target agent HTTP API", () => {
  it("shows the first available agent as the default of a Target without a choice", async () => {
    const api = await serverWithRealAgents();

    const response = await api.getAgent();

    expect(response.statusCode).toBe(200);
    expect(response.json()).toStrictEqual({ agent: "claude", chosen: false });
  });

  it("stores the chosen agent, even one that is unavailable now", async () => {
    const api = await serverWithRealAgents();

    const response = await api.putAgent("codex");

    expect(response.statusCode).toBe(200);
    expect(response.json()).toStrictEqual({ agent: "codex", chosen: true });
    await expect(api.getAgent().then((reply) => reply.json<unknown>())).resolves.toStrictEqual({
      agent: "codex",
      chosen: true,
    });
  });

  it("returns the default agent after the choice is cleared with null", async () => {
    const api = await serverWithRealAgents();
    await api.putAgent("codex");

    const response = await api.putAgent(null);

    expect(response.statusCode).toBe(200);
    expect(response.json()).toStrictEqual({ agent: "claude", chosen: false });
    await expect(api.getAgent().then((reply) => reply.json<unknown>())).resolves.toStrictEqual({
      agent: "claude",
      chosen: false,
    });
  });

  it("keeps the chosen agent after a server restart", async () => {
    const directory = await temporaryDirectory();
    const api = await demoApi(directory);
    await api.put(`/api/targets/${api.target.id}/agent`, { agent: "fake" });
    await api.stop();

    const restarted = await demoApi(directory);
    const response = await restarted.get(`/api/targets/${api.target.id}/agent`);

    expect(response.json()).toStrictEqual({ agent: "fake", chosen: true });
  });

  it.each([
    ["an agent the server does not offer", { agent: "claude" }],
    ["an unknown agent", { agent: "gpt" }],
    ["a number", { agent: 3 }],
    ["an empty body", {}],
    ["an extra field", { agent: "fake", extra: true }],
  ])("rejects %s with 400", async (_case, payload) => {
    const api = await demoApi();

    const response = await api.put(`/api/targets/${api.target.id}/agent`, payload);

    expect(response.statusCode).toBe(400);
    expect(response.json()).toStrictEqual({ error: "unknown_agent" });
  });

  it("answers 404 for an unknown Target", async () => {
    const api = await demoApi();

    const written = await api.put(`/api/targets/${unknownTarget}/agent`, { agent: "fake" });
    const read = await api.get(`/api/targets/${unknownTarget}/agent`);

    expect(written.statusCode).toBe(404);
    expect(written.json()).toStrictEqual({ error: "target_not_found" });
    expect(read.statusCode).toBe(404);
  });
});
