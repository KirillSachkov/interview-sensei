import { randomBytes } from "node:crypto";
import Fastify from "fastify";
import cookies from "@fastify/cookie";
import { guestWorkspace, guestWorkspacePath } from "@sensei/contracts";
import {
  openWorkspace,
  type WorkspaceStore,
} from "../modules/goals-and-scenarios/index.js";
import { lifetime } from "./session.js";

export async function makeApi(origin: string, store: WorkspaceStore) {
  const api = Fastify();
  await api.register(cookies);
  api.post(guestWorkspacePath, async (request, reply) => {
    if (request.headers.origin !== origin) return reply.code(403).send();
    const result = await openWorkspace(store, request.cookies["guest"], () =>
      randomBytes(32).toString("base64url"),
    );
    if (result.newSecret)
      reply.setCookie("guest", result.newSecret, {
        httpOnly: true,
        sameSite: "lax",
        secure: origin.startsWith("https://"),
        maxAge: lifetime,
        path: "/",
      });
    return reply
      .header("Cache-Control", "no-store")
      .send(guestWorkspace.parse({ workspaceId: result.workspaceId }));
  });
  return api;
}
