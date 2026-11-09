// Spec #45, seam 1, ticket #51: the archive of Targets. The Candidate moves an active Target to the
// archive and restores it; the archive is unavailable while an agent session of the Target runs.
import { describe, expect, it } from "vitest";

import { isIdle, openEvents } from "./chat-test-support.ts";
import { demoApi } from "./model-test-support.ts";
import type { TargetView } from "./model-test-support.ts";

type Api = Awaited<ReturnType<typeof demoApi>>;

const unknownId = "00000000-0000-4000-8000-000000000099";

async function post(api: Api, url: string) {
  return api.server.inject({ method: "POST", url, headers: api.headers });
}

async function archive(api: Api, id = api.target.id) {
  return post(api, `/api/targets/${id}/archive`);
}

async function restore(api: Api, id = api.target.id) {
  return post(api, `/api/targets/${id}/restore`);
}

async function listed(api: Api, url: string) {
  const response = await api.get(url);
  return response.json<{ id: string }[]>().map((target) => target.id);
}

/** Opens the Target's setup session and waits until its agent takes prompts. */
async function runningSetup(api: Api, id = api.target.id) {
  const opened = await post(api, `/api/targets/${id}/setup-session`);
  const events = await openEvents(api.server, opened.json<{ id: string }>().id);
  await events.waitFor(isIdle);
  return events;
}

describe("target archive", () => {
  it("moves an active Target from the Target list to the archive", async () => {
    const api = await demoApi();

    const response = await archive(api);

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ id: api.target.id, status: "archived" });
    await expect(listed(api, "/api/targets")).resolves.toStrictEqual([]);
    const archived = await api.get("/api/targets/archived");
    expect(archived.json()).toStrictEqual([
      { id: api.target.id, name: api.target.name, status: "archived", level: "middle" },
    ]);
  });

  it("restores an archived Target to the Target list", async () => {
    const api = await demoApi();
    await archive(api);

    const response = await restore(api);

    expect(response.statusCode).toBe(200);
    expect(response.json<TargetView>()).toStrictEqual(api.target);
    await expect(listed(api, "/api/targets")).resolves.toStrictEqual([api.target.id]);
    await expect(listed(api, "/api/targets/archived")).resolves.toStrictEqual([]);
  });

  it("refuses the archive while an agent session of the Target runs", async () => {
    const api = await demoApi();
    await runningSetup(api);

    const response = await archive(api);

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ error: "session_running" });
    await expect(listed(api, "/api/targets")).resolves.toStrictEqual([api.target.id]);
  });

  it("allows the archive once the Target's agent session has stopped", async () => {
    const api = await demoApi();
    const events = await runningSetup(api);
    events.send({ type: "prompt", text: "/crash" });
    await events.waitFor((view) => view.status === "failed");

    const response = await archive(api);

    expect(response.statusCode).toBe(200);
  });

  it("refuses to archive a draft Target, which is deleted instead", async () => {
    const api = await demoApi();
    const created = await post(api, "/api/targets");

    const response = await archive(api, created.json<TargetView>().id);

    expect(response.statusCode).toBe(409);
    expect(response.json()).toStrictEqual({ error: "target_draft" });
  });

  it("refuses to restore a Target that is not archived", async () => {
    const api = await demoApi();

    const response = await restore(api);

    expect(response.statusCode).toBe(409);
    expect(response.json()).toStrictEqual({ error: "target_not_archived" });
  });

  it("refuses a setup session of an archived Target", async () => {
    const api = await demoApi();
    await archive(api);

    const response = await post(api, `/api/targets/${api.target.id}/setup-session`);

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ error: "target_archived" });
  });

  it.each(["archive", "restore"])("answers 404 to %s of an unknown Target", async (action) => {
    const api = await demoApi();

    const response = await post(api, `/api/targets/${unknownId}/${action}`);

    expect(response.statusCode).toBe(404);
    expect(response.json()).toStrictEqual({ error: "target_not_found" });
  });
});
