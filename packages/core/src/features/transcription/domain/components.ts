// The components of speech recognition (spec #74): the application downloads them into its data
// directory only after the Candidate's consent. Every file has a pinned version and SHA-256.

/** The speech models the Candidate chooses from. */
export const modelIds = ["gigaam-v3", "parakeet-v3"] as const;
export type ModelId = (typeof modelIds)[number];

/** How the store turns a downloaded file into the files of its component. */
type Unpack =
  /** The file as it is. */
  | "none"
  /** A gzip file, such as an ffmpeg-static binary. */
  | "gunzip"
  /** An npm package tarball: its `package/` directory becomes the file's `path`. */
  | "npm-package"
  /** A zip archive whose files go into the directory `path`, such as the yt-dlp build. */
  | "zip";

/** One file of a component, with its pinned download. */
export interface ComponentFile {
  readonly url: string;
  /** The SHA-256 of the downloaded bytes, in lowercase hex. */
  readonly sha256: string;
  /** The size of the download in bytes. */
  readonly size: number;
  /** Where the file goes inside its component's directory, with `/` between parts. */
  readonly path: string;
  readonly unpack: Unpack;
  /** Whether the unpacked file is a program, such as ffmpeg; every file of a zip archive then. */
  readonly executable?: boolean;
}

/**
 * A component in a directory of its own: `engine` (sherpa-onnx-node with its platform package),
 * `ffmpeg`, `vad` (Silero VAD), `yt-dlp` or a model.
 */
export interface Component {
  readonly id: "engine" | "ffmpeg" | "vad" | "yt-dlp" | ModelId;
  /** Changes with the pinned files; an installed older version counts as missing. */
  readonly version: string;
  readonly files: readonly ComponentFile[];
}

/**
 * The components of this platform: the shared ones every model needs, yt-dlp for links to videos
 * and each model.
 */
export interface ComponentCatalog {
  readonly shared: readonly Component[];
  /** Reads links to videos: their data, subtitles and audio; needs no model for subtitles. */
  readonly ytDlp: Component;
  readonly models: Readonly<Record<ModelId, Component>>;
}

/** The bytes the component downloads. */
export function componentSize(component: Component): number {
  return component.files.reduce((sum, file) => sum + file.size, 0);
}

/**
 * The components to download for the chosen models: the missing shared ones first, then yt-dlp,
 * then the missing chosen models, each once. Without a chosen model only yt-dlp: links to videos
 * then give their subtitles, and nothing is recognized.
 */
export function installPlan(
  catalog: ComponentCatalog,
  { models, installed }: { models: readonly ModelId[]; installed: ReadonlySet<string> },
): Component[] {
  const wanted = modelIds.filter((id) => models.includes(id)).map((id) => catalog.models[id]);
  const shared = wanted.length === 0 ? [] : catalog.shared;
  return [...shared, catalog.ytDlp, ...wanted].filter((component) => !installed.has(component.id));
}
