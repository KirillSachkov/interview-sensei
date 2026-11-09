// Helpers of the API tests of a Target's materials (#50): a new Target, a file sent as the setup
// chat sends it, and the Target's Sources.
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Readable } from "node:stream";

import type { FastifyInstance } from "fastify";
import { expect } from "vitest";

import { browserHeaders } from "./chat-test-support.ts";
import type { TargetView } from "./model-test-support.ts";

export interface SourceView {
  readonly id: string;
  readonly targetId: string;
  readonly type: string;
  readonly title: string;
  readonly url: string | null;
  readonly path: string | null;
  readonly status: string;
  readonly createdAt: string;
}

export async function newTarget(server: FastifyInstance): Promise<TargetView> {
  const response = await server.inject({
    method: "POST",
    url: "/api/targets",
    headers: browserHeaders(server),
  });
  expect(response.statusCode).toBe(201);
  return response.json<TargetView>();
}

/** Sends the file as the setup chat does: its bytes in the body, its name in the address. */
export async function upload(
  server: FastifyInstance,
  { targetId, name, body }: { targetId: string; name: string; body: string | Buffer | Readable },
  headers: Record<string, string> = {},
) {
  return server.inject({
    method: "POST",
    url: `/api/targets/${targetId}/sources?${new URLSearchParams({ name }).toString()}`,
    headers: {
      ...browserHeaders(server),
      "content-type": "application/octet-stream",
      ...headers,
    },
    payload: body,
  });
}

export async function sources(server: FastifyInstance, targetId: string): Promise<SourceView[]> {
  const response = await server.inject({
    url: `/api/targets/${targetId}/sources`,
    headers: browserHeaders(server),
  });
  expect(response.statusCode).toBe(200);
  return response.json<{ sources: SourceView[] }>().sources;
}

/**
 * Where the Source's file lies in the data directory, without the Source's own directory, with
 * its name and text.
 */
export async function fileOf(dataDirectory: string, source: SourceView | undefined) {
  const file = String(source?.path);
  return {
    directory: path.relative(dataDirectory, path.dirname(path.dirname(file))),
    name: path.basename(file),
    text: await readFile(file, "utf8"),
  };
}
