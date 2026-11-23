import { randomBytes } from "node:crypto";
import Fastify from "fastify";
import cookies from "@fastify/cookie";
import { guestWorkspace, guestWorkspacePath } from "@sensei/contracts";
import { openWorkspace } from "../modules/goals-and-scenarios/index.js";
import type { WorkspaceStore } from "./storage.js";
import { sessionLifetimeSeconds } from "./session.js";

export async function makeApi(origin: string, store: WorkspaceStore) {
  const api = Fastify();
  await api.register(cookies);
  api.post(guestWorkspacePath, async (request, reply) => {
    if (request.headers.origin !== origin) return reply.code(403).send();
    const secret = request.cookies["guest"];
    const current = secret ? await store.find(secret) : undefined;
    const workspaceId = await openWorkspace(current, async () => {
      const fresh = randomBytes(32).toString("base64url");
      const id = await store.create(fresh);
      reply.setCookie("guest", fresh, {
        httpOnly: true,
        sameSite: "lax",
        secure: origin.startsWith("https://"),
        maxAge: sessionLifetimeSeconds,
        path: "/",
      });
      return id;
    });
    return reply
      .header("Cache-Control", "no-store")
      .send(guestWorkspace.parse({ workspaceId }));
  });
  return api;
}
