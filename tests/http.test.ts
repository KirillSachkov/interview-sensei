import { afterAll, beforeAll, expect, it } from "vitest";
import { PostgreSqlContainer } from "@testcontainers/postgresql";
import { Pool } from "pg";
import { guestWorkspace, guestWorkspacePath } from "@sensei/contracts";
import {
  migrate,
  workspaceStore,
} from "../apps/server/src/adapters/storage.js";
import { makeApi } from "../apps/server/src/adapters/http.js";

const origin = "https://example.test";
const setup = async () => {
  const db = await new PostgreSqlContainer("postgres:18.6-alpine3.24").start();
  const url = db.getConnectionUri();
  const pool = new Pool({ connectionString: url });
  await migrate(url);
  const store = workspaceStore(pool);
  const api = await makeApi(origin, store);
  return { db, pool, store, api, url };
};
let app: Awaited<ReturnType<typeof setup>>;
beforeAll(async () => {
  app = await setup();
}, 120000);
afterAll(async () => {
  if (app) {
    await app.api.close();
    await app.pool.end();
    await app.db.stop();
  }
});
it("restores only the cookie holder after migration and rejects foreign origins", async () => {
  const request = (source: string, cookie?: string) =>
    app.api.inject({
      method: "POST",
      url: guestWorkspacePath,
      headers: { origin: source, ...(cookie ? { cookie } : {}) },
    });
  expect((await request("https://other.test")).statusCode).toBe(403);
  const first = await request(origin);
  expect(first.statusCode).toBe(200);
  const { workspaceId } = guestWorkspace.parse(first.json<unknown>());
  const cookie = first.cookies[0];
  expect(cookie).toMatchObject({
    httpOnly: true,
    secure: true,
    sameSite: "Lax",
    path: "/",
  });
  expect(cookie?.maxAge).toBeGreaterThan(0);
  await migrate(app.url);
  expect(
    (await request(origin, `guest=${cookie?.value}`)).json<unknown>(),
  ).toEqual({ workspaceId });
  expect(
    guestWorkspace.parse(
      (await request(origin, `guest=${workspaceId}`)).json<unknown>(),
    ).workspaceId,
  ).not.toBe(workspaceId);
});
it("rolls back the workspace when writing its session fails", async () => {
  await app.store.create("duplicate");
  const count = async () =>
    (await app.pool.query<{ count: string }>("select count(*) from workspaces"))
      .rows;
  const before = await count();
  await expect(app.store.create("duplicate")).rejects.toThrow();
  expect(await count()).toEqual(before);
});
