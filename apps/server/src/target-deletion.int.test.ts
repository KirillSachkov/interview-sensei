// Spec #45, seam 1, ticket #51: deleting a Target for good. A draft Target goes at once; an
// archived one goes when the Candidate types its name. The deletion erases the Target's data in
// every slice in one transaction.
import type { FastifyInstance } from "fastify";
import { describe, expect, it } from "vitest";

import {
  agentTexts,
  isIdle,
  openEvents,
  startServer,
  temporaryDirectory,
} from "./chat-test-support.ts";
import type { SessionView } from "./chat-test-support.ts";
import {
  archivedDemo,
  demoName,
  request,
  targetData,
  targetRows,
} from "./deletion-test-support.ts";
import { demoApi, model } from "./model-test-support.ts";
import { deleteTarget } from "./target-deletion.ts";

describe("deleting an archived Target", () => {
  it("erases the Target's data and files in every slice when the Candidate types its name", async () => {
    const { dataDirectory, targetId, sessionId } = await archivedDemo();
    await expect(targetData(dataDirectory, { targetId, sessionId })).resolves.toStrictEqual({
      files: true,
      sessionFiles: true,
      rows: {
        "agent_sessions.sessions": 5,
        "answer_search.answer_reports": 1,
        "answer_search.answer_runs": 1,
        "interviews.asked_questions": 1,
        "interviews.attempts": 1,
        "interviews.disputes": 1,
        "interviews.interviews": 1,
        "interviews.side_threads": 1,
        "question_bank.questions": 31,
        "question_bank.topics": 5,
        "sources.inbox_proposals": 1,
        "sources.inbox_reports": 1,
        "sources.inbox_runs": 1,
        "sources.sources": 1,
        "target_setup.changes": 1,
        "targets.preferences": 0,
        "targets.sections": 3,
        "targets.targets": 1,
      },
    });
    const { server, stop } = await startServer(dataDirectory);

    const response = await request(server, {
      method: "DELETE",
      url: `/api/targets/${targetId}`,
      payload: { name: demoName },
    });

    expect(response.statusCode).toBe(204);
    await stop();
    const { rows, files, sessionFiles } = await targetData(dataDirectory, { targetId, sessionId });
    expect(Object.values(rows).every((count) => count === 0)).toBe(true);
    expect({ files, sessionFiles }).toStrictEqual({ files: false, sessionFiles: false });
  });

  it("keeps the Target when the typed name differs from its name", async () => {
    const { dataDirectory, targetId } = await archivedDemo();
    const { server } = await startServer(dataDirectory);

    const response = await request(server, {
      method: "DELETE",
      url: `/api/targets/${targetId}`,
      payload: { name: "Middle backend" },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toStrictEqual({ error: "name_mismatch" });
    const archived = await request(server, { method: "GET", url: "/api/targets/archived" });
    expect(archived.json()).toMatchObject([{ id: targetId }]);
  });

  it("refuses to delete an active Target, which goes to the archive first", async () => {
    const api = await demoApi();

    const response = await request(api.server, {
      method: "DELETE",
      url: `/api/targets/${api.target.id}`,
      payload: { name: demoName },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toStrictEqual({ error: "target_active" });
  });

  it("answers 404 for an unknown Target", async () => {
    const { server } = await startServer(await temporaryDirectory());

    const response = await request(server, {
      method: "DELETE",
      url: "/api/targets/00000000-0000-4000-8000-000000000099",
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toStrictEqual({ error: "target_not_found" });
  });

  it("rolls back the erasure of every slice when one slice fails", async () => {
    const features = await model();
    const { target } = await features.createDemo();
    await features.targets.archive(target.id);
    const failing = {
      eraseTarget: async () => {
        await Promise.resolve();
        throw new Error("The slice failed to erase");
      },
    };

    const deleted = deleteTarget(
      { ...features, targetData: [...features.targetData, failing] },
      target.id,
      demoName,
    );

    await expect(deleted).rejects.toThrow("The slice failed to erase");
    await expect(features.targets.get(target.id)).resolves.toStrictEqual({
      ...target,
      status: "archived",
    });
    await expect(features.questionBank.search(target.id)).resolves.toHaveLength(30);
  });
});

const onboarded = (view: SessionView) => isIdle(view) && agentTexts(view).length > 0;

/** A new draft Target whose setup session has started the onboarding. */
async function draftInSetup(server: FastifyInstance) {
  const created = await request(server, { method: "POST", url: "/api/targets" });
  const targetId = created.json<{ id: string }>().id;
  const opened = await request(server, {
    method: "POST",
    url: `/api/targets/${targetId}/setup-session`,
  });
  const events = await openEvents(server, opened.json<{ id: string }>().id);
  await events.waitFor(onboarded);
  return { targetId, events };
}

describe("deleting a draft Target", () => {
  it("deletes a draft Target at once and ends its setup session", async () => {
    const dataDirectory = await temporaryDirectory();
    const { server, stop } = await startServer(dataDirectory);
    const { targetId, events } = await draftInSetup(server);

    const response = await request(server, { method: "DELETE", url: `/api/targets/${targetId}` });

    expect(response.statusCode).toBe(204);
    await expect(events.waitFor((view) => view.status === "ended")).resolves.toBeDefined();
    await stop();
    const rows = await targetRows(dataDirectory, targetId);
    expect(Object.values(rows).every((count) => count === 0)).toBe(true);
  });
});
