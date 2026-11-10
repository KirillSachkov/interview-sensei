import type { FastifyInstance, FastifyReply } from "fastify";

import { modelIds } from "./composition.ts";
import type { Features, InstallOutcome, ModelId, RemoveOutcome } from "./composition.ts";

const installBody = {
  type: "object",
  properties: {
    models: {
      type: "array",
      items: { type: "string", enum: [...modelIds] },
      minItems: 1,
      maxItems: modelIds.length,
      uniqueItems: true,
    },
  },
  required: ["models"],
  additionalProperties: false,
} as const;

/** The answer to «Скачать» by its outcome. */
async function installReply(
  reply: FastifyReply,
  { transcription, outcome }: { transcription: Features["transcription"]; outcome: InstallOutcome },
) {
  switch (outcome) {
    case "started":
    case "installed": {
      return reply.code(outcome === "started" ? 202 : 200).send(await transcription.status());
    }
    case "running": {
      return reply.code(409).send({
        error: "install_running",
        message: "Компоненты распознавания уже скачиваются. Дождитесь конца загрузки.",
      });
    }
    case "unavailable": {
      return reply.code(400).send({
        error: outcome,
        message: "Распознавание речи не работает на этой платформе. Приложите транскрипт.",
      });
    }
    default: {
      return outcome satisfies never;
    }
  }
}

const removeParams = {
  type: "object",
  properties: { model: { type: "string", enum: [...modelIds] } },
  required: ["model"],
} as const;

/** The answer to «Удалить» of a model by its outcome. */
async function removeReply(
  reply: FastifyReply,
  { transcription, outcome }: { transcription: Features["transcription"]; outcome: RemoveOutcome },
) {
  switch (outcome) {
    case "removed": {
      return reply.code(200).send(await transcription.status());
    }
    case "running": {
      return reply.code(409).send({
        error: "install_running",
        message: "Компоненты распознавания скачиваются. Удалите модель после загрузки.",
      });
    }
    case "in_use": {
      return reply.code(409).send({
        error: "model_in_use",
        message: "Модель сейчас распознаёт видео. Удалите её после разбора или остановите разбор.",
      });
    }
    case "unavailable": {
      return reply.code(400).send({
        error: outcome,
        message: "Распознавание речи не работает на этой платформе.",
      });
    }
    default: {
      return outcome satisfies never;
    }
  }
}

/**
 * Speech recognition of video and audio files (spec #74):
 * - `GET /api/transcription`: `{ available: false }` on a platform without recognition; otherwise
 *   each model with its size and whether it is installed, the shared components (engine, ffmpeg,
 *   VAD), the running download with its bytes so far, the reason of the last failed download, and
 *   each language of recognition with the installed model that hears it, or null.
 * - `POST /api/transcription/install` `{ models }`: «Скачать», the Candidate's consent to download
 *   the chosen models with the shared components into the data directory; 202 while it downloads
 *   in the background, 200 when everything is installed, 409 `install_running` during another
 *   download, 400 `unavailable` on a platform without recognition.
 * - `DELETE /api/transcription/models/:model`: «Удалить», deletes the model's files and answers the
 *   state; the shared components stay. 409 `install_running` during a download, 409
 *   `model_in_use` while the model recognizes a recording, 400 `unavailable`.
 */
export function registerTranscriptionRoutes(
  server: FastifyInstance,
  { transcription }: Pick<Features, "transcription">,
) {
  server.get("/api/transcription", async () => transcription.status());
  server.post<{ Body: { models: ModelId[] } }>(
    "/api/transcription/install",
    { schema: { body: installBody } },
    async (request, reply) => {
      const outcome = await transcription.install(request.body.models);
      return installReply(reply, { transcription, outcome });
    },
  );
  server.delete<{ Params: { model: ModelId } }>(
    "/api/transcription/models/:model",
    { schema: { params: removeParams } },
    async (request, reply) => {
      const outcome = await transcription.remove(request.params.model);
      return removeReply(reply, { transcription, outcome });
    },
  );
}
