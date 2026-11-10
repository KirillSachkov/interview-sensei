// Spec #45, seam 1, ticket #51: deleting a Target for good. A draft Target goes at once; an
// archived one goes when the Candidate types its name. The deletion erases the Target's data in
// every slice in one transaction.
import { access } from "node:fs/promises";
import path from "node:path";

import { openStorage } from "@interview-sensei/core/storage";
import type { FastifyInstance } from "fastify";
import { describe, expect, it } from "vitest";

import {
  agentTexts,
  browserHeaders,
  fixedTime,
  isIdle,
  openEvents,
  startServer,
  temporaryDirectory,
} from "./chat-test-support.ts";
import type { SessionView } from "./chat-test-support.ts";
import { backgroundWork } from "./answer-test-support.ts";
import { demoApi, model } from "./model-test-support.ts";
import { demoWithSideThread } from "./side-thread-test-support.ts";
import { deleteTarget } from "./target-deletion.ts";

const demoName = "Middle backend-разработчик на TypeScript";

async function request(
  server: FastifyInstance,
  { method, url, payload }: { method: "POST" | "DELETE" | "GET"; url: string; payload?: object },
) {
  return server.inject({
    method,
    url,
    headers: browserHeaders(server),
    ...(payload === undefined ? {} : { payload }),
  });
}

/**
 * The number of rows that reference the Target in every table of every slice: its own row in
 * `targets.targets`, and each row with a `target_id`. Opens the data directory of a stopped server.
 */
async function targetRows(dataDirectory: string, targetId: string) {
  const storage = await openStorage({
    dataDirectory,
    clock: { now: () => new Date(fixedTime) },
    timer: { repeat: () => () => {}, after: () => () => {} },
    migrations: [],
    onDumpFailed: () => {},
  });
  try {
    const { database } = storage;
    const tables = await database.execute<{ table_schema: string; table_name: string }>(
      "select table_schema, table_name from information_schema.columns where column_name = 'target_id'",
    );
    const counted = await Promise.all(
      tables.rows.map(async ({ table_schema: schema, table_name: table }) => {
        const result = await database.execute<{ rows: number }>(
          `select count(*)::int as rows from "${schema}"."${table}" where target_id = '${targetId}'`,
        );
        return [`${schema}.${table}`, result.rows[0]?.rows] as const;
      }),
    );
    const own = await database.execute<{ rows: number }>(
      `select count(*)::int as rows from targets.targets where id = '${targetId}'`,
    );
    // These rows reach the Target through their Mock interview; the data directory has one Target.
    const interviewRows = await Promise.all(
      ["asked_questions", "attempts", "disputes", "side_threads"].map(async (table) => {
        const result = await database.execute<{ rows: number }>(
          `select count(*)::int as rows from interviews.${table}`,
        );
        return [`interviews.${table}`, result.rows[0]?.rows] as const;
      }),
    );
    return Object.fromEntries([
      ["targets.targets", own.rows[0]?.rows],
      ...counted,
      ...interviewRows,
    ]);
  } finally {
    await storage.close();
  }
}

async function exists(file: string): Promise<boolean> {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

/**
 * The Target's rows in every slice, whether its files are in the data directory, and whether the
 * working directory of its session is.
 */
async function targetData(
  dataDirectory: string,
  { targetId, sessionId }: { targetId: string; sessionId: string },
) {
  const rows = await targetRows(dataDirectory, targetId);
  const files = await exists(path.join(dataDirectory, "targets", targetId));
  const sessionFiles = await exists(path.join(dataDirectory, "sessions", sessionId));
  return { rows, files, sessionFiles };
}

/**
 * The demo Target with a finished Mock interview and a Side thread from its Debrief, a material
 * with its proposal, Inbox processing and report, an answer search with its report, and a draft
 * change of its setup agent; the agents then crash, so no session of the Target runs.
 */
async function demoWithData(dataDirectory: string) {
  const api = await demoWithSideThread(dataDirectory);
  const opened = await request(api.server, {
    method: "POST",
    url: `/api/targets/${api.target.id}/setup-session`,
  });
  const events = await openEvents(api.server, opened.json<{ id: string }>().id);
  await events.waitFor(isIdle);
  events.send({ type: "prompt", text: '/tool update_target {"name":"Go"}' });
  await events.waitFor((view) => isIdle(view) && agentTexts(view).length > 0);
  await backgroundWork(api.server, { setup: events, targetId: api.target.id });
  events.send({ type: "prompt", text: "/crash" });
  await events.waitFor((view) => view.status === "failed");
  return { ...api, sessionId: opened.json<{ id: string }>().id };
}

/** The demo Target with data in every slice, archived; the server is stopped. */
async function archivedDemo() {
  const dataDirectory = await temporaryDirectory();
  const api = await demoWithData(dataDirectory);
  const archived = await request(api.server, {
    method: "POST",
    url: `/api/targets/${api.target.id}/archive`,
  });
  expect(archived.statusCode).toBe(200);
  await api.stop();
  return { dataDirectory, targetId: api.target.id, sessionId: api.sessionId };
}

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
