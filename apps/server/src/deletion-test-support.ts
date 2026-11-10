// Helpers of the deletion tests in target-deletion.int.test.ts and
// target-deletion-leftovers.int.test.ts: a demo Target with data in every slice, and its rows and
// files in a stopped server's data directory.
import { access } from "node:fs/promises";
import path from "node:path";

import { openStorage } from "@interview-sensei/core/storage";
import type { FastifyInstance } from "fastify";
import { expect } from "vitest";

import {
  agentTexts,
  browserHeaders,
  fixedTime,
  isIdle,
  openEvents,
  temporaryDirectory,
} from "./chat-test-support.ts";
import { backgroundWork } from "./answer-test-support.ts";
import { demoWithSideThread } from "./side-thread-test-support.ts";

export const demoName = "Middle backend-разработчик на TypeScript";

export async function request(
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
export async function targetRows(dataDirectory: string, targetId: string) {
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

export async function exists(file: string): Promise<boolean> {
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
export async function targetData(
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
export async function archivedDemo() {
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
