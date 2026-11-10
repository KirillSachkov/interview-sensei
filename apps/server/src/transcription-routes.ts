import type { FastifyInstance, FastifyReply } from "fastify";

import { modelIds } from "./composition.ts";
import type { Features, InstallOutcome, ModelId } from "./composition.ts";

const installBody = {
  type: "object",
  properties: {
    models: {
      type: "array",
      items: { type: "string", enum: [...modelIds] },
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

/**
 * Speech recognition of video and audio files (spec #74):
 * - `GET /api/transcription`: `{ available: false }` on a platform without recognition; otherwise
 *   each model with its size and whether it is installed, the shared components (engine, ffmpeg,
 *   VAD), yt-dlp, the running download with its bytes so far and the reason of the last failed
 *   download.
 * - `POST /api/transcription/install` `{ models }`: «Скачать», the Candidate's consent to download
 *   the chosen models with the shared components and yt-dlp into the data directory; an empty list
 *   downloads yt-dlp alone, so links give their subtitles without a model. 202 while it downloads
 *   in the background, 200 when everything is installed, 409 `install_running` during another
 *   download, 400 `unavailable` on a platform without recognition.
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
}
