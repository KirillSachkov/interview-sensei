// Speech recognition through sherpa-onnx-node that the application downloaded into its data
// directory: Silero VAD cuts the sound into phrases and the model recognizes each phrase. The loop
// follows the official example `nodejs-addon-examples/test_vad_with_non_streaming_asr_whisper.js`
// of k2-fsa/sherpa-onnx (Apache-2.0, see NOTICE), with streamed samples and asynchronous decoding.
import { createRequire } from "node:module";
import { availableParallelism } from "node:os";
import path from "node:path";

import type { ModelId } from "../domain/components.ts";
import type { SpeechRecognizer } from "../domain/ports.ts";
import { transcriptText } from "../domain/recognition.ts";
import type { Phrase } from "../domain/recognition.ts";
import { componentsDirectory } from "./component-store.ts";

const sampleRate = 16_000;

/**
 * Silero VAD settings. The spec-74 findings record the check on an 18-minute Russian recording:
 * a pause of 0.5 s ends a phrase, and a phrase longer than 20 s is cut, because GigaAM hears at
 * most about 25 s at once.
 */
const vadSettings = {
  threshold: 0.5,
  minSpeechDuration: 0.25,
  minSilenceDuration: 0.5,
  maxSpeechDuration: 20,
  windowSize: 512,
} as const;

/** The files of each model in its component directory, as the sherpa-onnx export names them. */
const modelFiles: Readonly<
  Record<ModelId, { encoder: string; decoder: string; joiner: string; featureDim: number }>
> = {
  "gigaam-v3": {
    encoder: "encoder.int8.onnx",
    decoder: "decoder.onnx",
    joiner: "joiner.onnx",
    featureDim: 64,
  },
  "parakeet-v3": {
    encoder: "encoder.int8.onnx",
    decoder: "decoder.int8.onnx",
    joiner: "joiner.int8.onnx",
    featureDim: 80,
  },
};

interface Recognizer {
  createStream: () => {
    acceptWaveform: (wave: { samples: Float32Array; sampleRate: number }) => void;
  };
  decodeAsync: (stream: unknown) => Promise<{ text: string }>;
}

interface Vad {
  acceptWaveform: (samples: Float32Array) => void;
  isEmpty: () => boolean;
  front: () => { samples: Float32Array; start: number };
  pop: () => void;
  flush: () => void;
}

/** The part of sherpa-onnx-node 2.0.1 this adapter uses; the package ships JavaScript only. */
interface SherpaOnnx {
  readonly OfflineRecognizer: { createAsync: (config: unknown) => Promise<Recognizer> };
  readonly Vad: new (config: unknown, bufferSeconds: number) => Vad;
}

function isSherpa(value: unknown): value is SherpaOnnx {
  return (
    typeof value === "object" && value !== null && "OfflineRecognizer" in value && "Vad" in value
  );
}

/** Loads the downloaded package; its loader finds the platform package beside it. */
function loadSherpa(root: string): SherpaOnnx {
  const engine = path.join(root, "engine", "node_modules", "sherpa-onnx-node", "package.json");
  // The package lies in the data directory, outside the application's dependencies.
  const required: unknown = createRequire(engine)("sherpa-onnx-node");
  if (!isSherpa(required)) {
    throw new Error("sherpa-onnx-node in the data directory has no recognizer");
  }
  return required;
}

/** Threads for the model: half of the cores, from 1 to 4; more threads gave unstable times. */
function threads(): number {
  return Math.max(1, Math.min(4, Math.floor(availableParallelism() / 2)));
}

async function recognizerFor(sherpa: SherpaOnnx, root: string, model: ModelId) {
  const directory = path.join(root, model);
  const files = modelFiles[model];
  return sherpa.OfflineRecognizer.createAsync({
    featConfig: { sampleRate, featureDim: files.featureDim },
    modelConfig: {
      transducer: {
        encoder: path.join(directory, files.encoder),
        decoder: path.join(directory, files.decoder),
        joiner: path.join(directory, files.joiner),
      },
      tokens: path.join(directory, "tokens.txt"),
      modelType: "nemo_transducer",
      numThreads: threads(),
      provider: "cpu",
      debug: 0,
    },
  });
}

function createVad(sherpa: SherpaOnnx, root: string): Vad {
  const sileroVad = { model: path.join(root, "vad", "silero_vad.onnx"), ...vadSettings };
  return new sherpa.Vad({ sileroVad, sampleRate, numThreads: 1, debug: false }, 120);
}

/** Recognizes each phrase that VAD has ended, in order. */
async function recognizePhrases(vad: Vad, recognizer: Recognizer, phrases: Phrase[]) {
  while (!vad.isEmpty()) {
    const segment = vad.front();
    vad.pop();
    const stream = recognizer.createStream();
    stream.acceptWaveform({ samples: segment.samples, sampleRate });
    // oxlint-disable-next-line eslint/no-await-in-loop -- the phrases are recognized in order
    const { text } = await recognizer.decodeAsync(stream);
    const start = segment.start / sampleRate;
    phrases.push({ start, end: start + segment.samples.length / sampleRate, text });
  }
}

/** Gives VAD the samples in windows of its size; resolves with the samples left for the next. */
async function feed(
  { vad, recognizer, phrases }: { vad: Vad; recognizer: Recognizer; phrases: Phrase[] },
  samples: Float32Array,
): Promise<Float32Array> {
  const window = vadSettings.windowSize;
  let offset = 0;
  for (; offset + window <= samples.length; offset += window) {
    vad.acceptWaveform(samples.subarray(offset, offset + window));
    // oxlint-disable-next-line eslint/no-await-in-loop -- each phrase goes to the model as VAD ends it
    await recognizePhrases(vad, recognizer, phrases);
  }
  return samples.slice(offset);
}

function joined(first: Float32Array, second: Float32Array): Float32Array {
  const both = new Float32Array(first.length + second.length);
  both.set(first);
  both.set(second, first.length);
  return both;
}

/** Gives VAD every sample of the recording, telling `onSeconds` the seconds heard so far. */
async function hear(
  work: { vad: Vad; recognizer: Recognizer; phrases: Phrase[] },
  {
    samples,
    onSeconds,
    signal,
  }: Pick<Parameters<SpeechRecognizer["recognize"]>[0], "samples" | "onSeconds" | "signal">,
) {
  let heard = 0;
  let pending: Float32Array = new Float32Array(0);
  for await (const chunk of samples) {
    signal.throwIfAborted();
    pending = await feed(work, joined(pending, chunk));
    heard += chunk.length / sampleRate;
    onSeconds(heard);
  }
}

/** Recognizes speech with the components in the data directory. */
export function sherpaRecognizer(dataDirectory: string): SpeechRecognizer {
  const root = componentsDirectory(dataDirectory);
  return {
    recognize: async ({ model, samples, onSeconds, signal }) => {
      const sherpa = loadSherpa(root);
      const work = {
        vad: createVad(sherpa, root),
        recognizer: await recognizerFor(sherpa, root, model),
        phrases: [] as Phrase[],
      };
      await hear(work, { samples, onSeconds, signal });
      work.vad.flush();
      await recognizePhrases(work.vad, work.recognizer, work.phrases);
      return transcriptText(work.phrases);
    },
  };
}
