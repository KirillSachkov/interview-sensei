import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import type { Features } from "./composition.ts";

type Dependencies = Pick<Features, "sources">;

const params = {
  type: "object",
  properties: { id: { type: "string", format: "uuid" } },
  required: ["id"],
} as const;

const fileTooLargeMessage = "Файл больше 100 МБ. Прикрепите файл до 100 МБ.";

/** The body's size that the request declares; undefined for a chunked body. */
function declaredSize(request: FastifyRequest): number | undefined {
  const header = request.headers["content-length"];
  const size = header === undefined ? Number.NaN : Number(header);
  return Number.isSafeInteger(size) ? size : undefined;
}

/** Answers before the whole body arrived: the rest of the body is read and dropped. */
async function refuse(request: FastifyRequest, reply: FastifyReply, body: object) {
  request.raw.resume();
  return reply.send(body);
}

/**
 * `POST /api/targets/:id/sources?name=<file name>` takes the file's bytes as an
 * `application/octet-stream` body and streams them to the data directory: the server never holds
 * a file of up to 100 MB in memory.
 */
function registerUpload(scope: FastifyInstance, { sources }: Dependencies) {
  scope.addContentTypeParser("application/octet-stream", (_request, payload, done) => {
    done(null, payload);
  });
  scope.post<{ Params: { id: string }; Querystring: { name: string } }>(
    "/api/targets/:id/sources",
    {
      schema: {
        params,
        querystring: {
          type: "object",
          properties: { name: { type: "string", minLength: 1, maxLength: 1000 } },
          required: ["name"],
        },
      },
    },
    async (request, reply) => {
      const saved = await sources.saveFile(request.params.id, {
        name: request.query.name,
        // A refused file leaves the request open, so the reply reaches the browser.
        bytes: request.raw.iterator({ destroyOnReturn: false }),
        size: declaredSize(request),
      });
      switch (saved.outcome) {
        case "saved": {
          return reply.code(201).send(saved.source);
        }
        case "not_found": {
          return refuse(request, reply.code(404), { error: "target_not_found" });
        }
        case "too_large": {
          return refuse(request, reply.code(413), {
            error: "file_too_large",
            message: fileTooLargeMessage,
          });
        }
        default: {
          return saved satisfies never;
        }
      }
    },
  );
}

/**
 * The materials of a Target:
 * - `GET /api/targets/:id/sources`: `{ sources }`, the Target's Sources in the order they were
 *   added, each with the absolute `path` of its file or the `url` of its link.
 * - `POST /api/targets/:id/sources?name=<file name>`: saves the `application/octet-stream` body as
 *   a file Source in the Target's data directory and answers it, 201. 413 `file_too_large` with a
 *   `message` for a file larger than 100 MB; nothing is kept then.
 */
export function registerSourceRoutes(server: FastifyInstance, dependencies: Dependencies) {
  server.get<{ Params: { id: string } }>(
    "/api/targets/:id/sources",
    { schema: { params } },
    async (request, reply) => {
      const list = await dependencies.sources.list(request.params.id);
      return list === undefined
        ? reply.code(404).send({ error: "target_not_found" })
        : { sources: list };
    },
  );
  void server.register((scope, _options, done) => {
    registerUpload(scope, dependencies);
    done();
  });
}
