import { isObject } from "./http";
import { request } from "./request";

/** A speech model the Candidate chooses: GigaAM v3 for Russian, Parakeet for 25 languages. */
export type ModelId = "gigaam-v3" | "parakeet-v3";

/**
 * Speech recognition on this device: each model with its download size and whether it is
 * installed, the components every model needs, the running download and the last failure.
 */
export type TranscriptionStatus =
  | { readonly available: false }
  | {
      readonly available: true;
      readonly models: readonly {
        readonly id: ModelId;
        readonly name: string;
        readonly languages: string;
        /** Bytes to download. */
        readonly size: number;
        readonly installed: boolean;
      }[];
      /** sherpa-onnx, ffmpeg and Silero VAD. */
      readonly shared: { readonly size: number; readonly installed: boolean };
      readonly installation: {
        readonly models: readonly ModelId[];
        readonly downloaded: number;
        readonly total: number;
      } | null;
      /** Why the last download failed, in Russian. */
      readonly failure: string | null;
    };

function isStatus(value: unknown): value is TranscriptionStatus {
  return isObject(value) && typeof value.available === "boolean";
}

export async function fetchTranscription(): Promise<TranscriptionStatus> {
  const body = await request("/api/transcription");
  if (!isStatus(body)) {
    throw new Error("неожиданный ответ");
  }
  return body;
}

/**
 * «Скачать»: the Candidate's consent to download the chosen models with the shared components into
 * the application's data directory. Throws the server's Russian message during another download.
 */
export async function installTranscription(models: readonly ModelId[]): Promise<void> {
  await request("/api/transcription/install", { method: "POST", body: { models } });
}
