// Helpers of the API tests of speech recognition (spec #74): the components come from a local HTTP
// server as small files with their real SHA-256, and stubs stand for ffmpeg and the model. No test
// downloads or runs the real components; the live check in CI does (transcription.live.test.ts).
import { createHash } from "node:crypto";

import type { FastifyInstance } from "fastify";
import { expect, vi } from "vitest";

import type {
  Component,
  ComponentCatalog,
  ModelId,
  TranscriptionComponents,
} from "./composition.ts";
import { browserHeaders, startServer, temporaryDirectory } from "./chat-test-support.ts";
import { componentServer, newHold } from "./component-server-test-support.ts";
import { stubExtractor } from "./ffmpeg-stub-test-support.ts";
import { stubLinks } from "./video-link-test-support.ts";
import { api, appliedTarget } from "./setup-test-support.ts";
import { sources } from "./source-test-support.ts";

/** The size of each made-up component file: the models are the larger ones, as in life. */
const sizes: Readonly<Record<Component["id"], number>> = {
  engine: 3000,
  ffmpeg: 2000,
  vad: 1000,
  "yt-dlp": 4000,
  "gigaam-v3": 17_000,
  "parakeet-v3": 49_000,
};

/** Bytes of the made-up file of the component. */
function contentOf(id: Component["id"]): Buffer {
  return Buffer.alloc(sizes[id], id);
}

/** The component as one made-up file on the server; `broken` gives it a wrong SHA-256. */
function servedComponent(base: string, id: Component["id"], broken: boolean): Component {
  const bytes = contentOf(id);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  return {
    id,
    version: `${id}-1`,
    files: [
      {
        url: `${base}/${id}`,
        sha256: broken ? "0".repeat(64) : sha256,
        size: bytes.length,
        path: `${id}.bin`,
        unpack: "none",
      },
    ],
  };
}

/**
 * The made-up components on a local HTTP server, each one file with its true size and SHA-256;
 * `brokenSha` gives that component a wrong SHA-256, as a file changed on the way would have.
 */
async function catalogOnServer({ brokenSha }: { brokenSha?: Component["id"] } = {}) {
  const ids = ["engine", "ffmpeg", "vad", "yt-dlp", "gigaam-v3", "parakeet-v3"] as const;
  const served = await componentServer(new Map(ids.map((id) => [id, contentOf(id)])));
  const component = (id: Component["id"]) => servedComponent(served.base, id, id === brokenSha);
  const catalog: ComponentCatalog = {
    shared: [component("engine"), component("ffmpeg"), component("vad")],
    ytDlp: component("yt-dlp"),
    models: { "gigaam-v3": component("gigaam-v3"), "parakeet-v3": component("parakeet-v3") },
  };
  return { catalog, served };
}

/** A line that makes the stub model wait until the test calls `continueSpeech`. */
export const waitMark = "[ждать]";

/** The line of the stub recording that the samples carry. */
function lineOf(samples: Float32Array): string {
  return new TextDecoder().decode(Uint8Array.from(samples));
}

/** Resolves once the hold is released; rejects with the signal's reason once it aborts. */
async function releasedOrAborted(released: Promise<unknown>, signal: AbortSignal): Promise<void> {
  signal.throwIfAborted();
  const aborted = Promise.withResolvers<never>();
  const onAbort = () => {
    aborted.reject(signal.reason);
  };
  signal.addEventListener("abort", onAbort, { once: true });
  try {
    await Promise.race([released, aborted.promise]);
  } finally {
    signal.removeEventListener("abort", onAbort);
  }
}

/**
 * A stub model: it hears each line of the stub recording as one second and returns the lines as
 * the text. At «[ждать]» it waits for `continueSpeech`, or for the cancel of its run.
 * `heard` records the model of each run, `cancelled` counts the cancelled runs.
 */
function stubRecognizer() {
  const heard: ModelId[] = [];
  const control = { waiting: newHold(), cancelled: 0 };
  /** The lines of the samples in order; at «[ждать]» it waits for the test or the cancel. */
  const hear = async ({
    samples,
    onSeconds,
    signal,
  }: Parameters<NonNullable<TranscriptionComponents["recognizer"]>["recognize"]>[0]) => {
    const lines: string[] = [];
    for await (const chunk of samples) {
      const line = lineOf(chunk);
      if (line === waitMark) {
        control.waiting.reach();
        await releasedOrAborted(control.waiting.released, signal);
      }
      lines.push(line);
      onSeconds(lines.length);
    }
    return lines;
  };
  const recognizer: NonNullable<TranscriptionComponents["recognizer"]> = {
    recognize: async (request) => {
      heard.push(request.model);
      try {
        const lines = await hear(request);
        return lines.filter((line) => line !== waitMark).join(" ");
      } catch (error) {
        control.cancelled += request.signal.aborted ? 1 : 0;
        throw error;
      }
    },
  };
  return { recognizer, heard, control };
}

/**
 * The stand-ins of a server: the made-up catalog on a local HTTP server, the stub extractor, the
 * stub yt-dlp and the stub model. Pass `components` to startServer as `transcription`.
 * `model.waiting()` resolves when the model reaches «[ждать]», and `model.continueSpeech()` lets it
 * go on. `links` holds the videos the stub yt-dlp knows.
 */
export async function stubTranscription(options: { brokenSha?: Component["id"] } = {}) {
  const { catalog, served } = await catalogOnServer(options);
  const { recognizer, heard, control } = stubRecognizer();
  const links = await stubLinks();
  return {
    components: { catalog, extractor: stubExtractor(), recognizer, links: links.links },
    served,
    links,
    model: {
      heard,
      /** How many runs of the model were cancelled. */
      get cancelled() {
        return control.cancelled;
      },
      waiting: async () => control.waiting.reached,
      continueSpeech: () => {
        control.waiting.release();
        control.waiting = newHold();
      },
    },
  };
}

/** The state of speech recognition as «Распознавание речи» and the processing card read it. */
export interface TranscriptionStatus {
  readonly available: boolean;
  readonly models: readonly {
    readonly id: ModelId;
    readonly name: string;
    readonly languages: string;
    readonly size: number;
    readonly installed: boolean;
  }[];
  readonly shared: { readonly size: number; readonly installed: boolean };
  readonly ytDlp: { readonly size: number; readonly installed: boolean };
  readonly installation: {
    readonly models: readonly ModelId[];
    readonly downloaded: number;
    readonly total: number;
  } | null;
  readonly failure: string | null;
  /** The languages of recognition, each with the installed model that hears it, or null. */
  readonly languages: readonly {
    readonly code: string;
    readonly name: string;
    readonly model: ModelId | null;
  }[];
}

export async function transcriptionStatus(server: FastifyInstance): Promise<TranscriptionStatus> {
  const response = await api(server).get("/api/transcription");
  expect(response.statusCode).toBe(200);
  return response.json<TranscriptionStatus>();
}

/** «Скачать» with the chosen models. */
export async function installModels(server: FastifyInstance, models: readonly ModelId[]) {
  return server.inject({
    method: "POST",
    url: "/api/transcription/install",
    headers: browserHeaders(server),
    payload: { models },
  });
}

/** «Удалить» of the model in «Распознавание речи». */
export async function removeModel(server: FastifyInstance, model: ModelId) {
  return server.inject({
    method: "DELETE",
    url: `/api/transcription/models/${model}`,
    headers: browserHeaders(server),
  });
}

/** The state once no download runs. */
export async function afterDownload(server: FastifyInstance): Promise<TranscriptionStatus> {
  return vi.waitFor(
    async () => {
      const status = await transcriptionStatus(server);
      expect(status.installation).toBeNull();
      return status;
    },
    { timeout: 10_000, interval: 20 },
  );
}

/** Installs the models and waits for the download to end. */
export async function installed(server: FastifyInstance, models: readonly ModelId[]) {
  const response = await installModels(server, models);
  expect(response.statusCode).toBe(202);
  return afterDownload(server);
}

/**
 * An active Target and its setup chat on a server with the stand-ins and a data directory of its
 * own; the models of `models` are installed.
 */
export async function transcriptionTarget(models: readonly ModelId[] = ["gigaam-v3"]) {
  const dataDirectory = await temporaryDirectory();
  const stub = await stubTranscription();
  const { server, stop } = await startServer(dataDirectory, { transcription: stub.components });
  if (models.length > 0) {
    await installed(server, models);
  }
  const { target, events: setup } = await appliedTarget(server);
  return { server, stop, dataDirectory, target, setup, ...stub };
}

/**
 * The Target's first Source while the stub model holds at «[ждать]» after the first of four
 * seconds: «транскрибируется» at 25 %. The hold keeps the percent, so the wait has no time limit
 * of its own: it reads the Sources once per turn of the event loop until the server stored the
 * percent, and only the test's timeout bounds it.
 */
export async function heldAtQuarter(
  server: FastifyInstance,
  { targetId, model }: { targetId: string; model: { waiting: () => Promise<unknown> } },
) {
  await model.waiting();
  for (;;) {
    // oxlint-disable-next-line eslint/no-await-in-loop -- one read per turn until the write lands
    const [listed] = await sources(server, targetId);
    if (listed?.status === "transcribing" && listed.progress === 25) {
      return listed;
    }
    // oxlint-disable-next-line eslint/no-await-in-loop -- lets the server's progress write run
    await new Promise((resolve) => {
      setImmediate(resolve);
    });
  }
}

/** A stub video whose recognition waits at «[ждать]» until the test lets it go on. */
export const heldVideo = `Расскажите про горутины.\n${waitMark}\nЧто такое канал?\n`;

/** «Запустить разбор» of the card: the chosen materials and the language of each recording. */
export async function startWithLanguages(
  server: FastifyInstance,
  {
    targetId,
    sourceIds,
    languages,
  }: { targetId: string; sourceIds?: readonly string[]; languages: Record<string, string> },
) {
  return server.inject({
    method: "POST",
    url: `/api/targets/${targetId}/inbox/processing`,
    headers: browserHeaders(server),
    payload: { ...(sourceIds === undefined ? {} : { sourceIds }), languages },
  });
}
