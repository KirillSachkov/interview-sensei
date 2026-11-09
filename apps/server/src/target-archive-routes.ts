import type { FastifyInstance } from "fastify";

import type { Features } from "./composition.ts";
import { deleteTarget } from "./target-deletion.ts";

type Dependencies = Pick<Features, "targets" | "sessions" | "storage" | "targetData">;

const params = {
  type: "object",
  properties: { id: { type: "string", format: "uuid" } },
  required: ["id"],
} as const;

const sessionRunningMessage =
  "Цель нельзя убрать в архив, пока по ней идёт сессия агента. Завершите сессию и повторите.";

/** The name the Candidate typed to confirm the deletion; undefined without a body. */
function typedName(body: unknown): string | undefined | null {
  if (body === undefined || body === null) {
    return undefined;
  }
  const name: unknown =
    typeof body === "object" && Object.keys(body).length === 1 && "name" in body ? body.name : null;
  return typeof name === "string" ? name : null;
}

function registerArchive(server: FastifyInstance, { targets, sessions }: Dependencies) {
  server.post<{ Params: { id: string } }>(
    "/api/targets/:id/archive",
    { schema: { params } },
    async (request, reply) => {
      const { id } = request.params;
      if (sessions.running(id)) {
        return reply.code(409).send({ error: "session_running", message: sessionRunningMessage });
      }
      const archived = await targets.archive(id);
      if (archived === "target_not_found" || archived === undefined) {
        return reply.code(404).send({ error: "target_not_found" });
      }
      return typeof archived === "string" ? reply.code(409).send({ error: archived }) : archived;
    },
  );
  server.post<{ Params: { id: string } }>(
    "/api/targets/:id/restore",
    { schema: { params } },
    async (request, reply) => {
      const restored = await targets.restore(request.params.id);
      if (restored === "target_not_found" || restored === undefined) {
        return reply.code(404).send({ error: "target_not_found" });
      }
      return typeof restored === "string" ? reply.code(409).send({ error: restored }) : restored;
    },
  );
}

/**
 * The archive and the deletion of Targets:
 * - `GET /api/targets/archived`: the archived Targets, the oldest first.
 * - `POST /api/targets/:id/archive`: moves an active Target to the archive and answers it; 409
 *   `session_running` while an agent session of the Target runs, 409 `target_draft` for a draft.
 * - `POST /api/targets/:id/restore`: returns an archived Target; 409 `target_not_archived`.
 * - `DELETE /api/targets/:id`: deletes a draft Target at once, or an archived one with `{ name }`,
 *   its exact name; 204. 400 `name_mismatch`, 409 `target_active` for an active Target.
 */
export function registerTargetArchiveRoutes(server: FastifyInstance, dependencies: Dependencies) {
  server.get("/api/targets/archived", async () => dependencies.targets.archived());
  registerArchive(server, dependencies);
  server.delete<{ Params: { id: string }; Body: unknown }>(
    "/api/targets/:id",
    { schema: { params } },
    async (request, reply) => {
      const name = typedName(request.body);
      if (name === null) {
        return reply.code(400).send({ error: "invalid_name" });
      }
      const deleted = await deleteTarget(dependencies, request.params.id, name);
      switch (deleted) {
        case "deleted": {
          return reply.code(204).send();
        }
        case "target_not_found": {
          return reply.code(404).send({ error: deleted });
        }
        case "name_mismatch": {
          return reply.code(400).send({ error: deleted });
        }
        case "target_active": {
          return reply.code(409).send({ error: deleted });
        }
        default: {
          return deleted satisfies never;
        }
      }
    },
  );
}
