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
  | "npm-package";

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
  /** Whether the unpacked file is a program, such as ffmpeg. */
  readonly executable?: boolean;
}

/**
 * A component in a directory of its own: `engine` (sherpa-onnx-node with its platform package),
 * `ffmpeg`, `vad` (Silero VAD) or a model.
 */
export interface Component {
  readonly id: "engine" | "ffmpeg" | "vad" | ModelId;
  /** Changes with the pinned files; an installed older version counts as missing. */
  readonly version: string;
  readonly files: readonly ComponentFile[];
}

/** The components of this platform: the shared ones every model needs, and each model. */
export interface ComponentCatalog {
  readonly shared: readonly Component[];
  readonly models: Readonly<Record<ModelId, Component>>;
}

/** The bytes the component downloads. */
export function componentSize(component: Component): number {
  return component.files.reduce((sum, file) => sum + file.size, 0);
}

/**
 * The components to download for the chosen models: the missing shared ones first, then the
 * missing chosen models, each once.
 */
export function installPlan(
  catalog: ComponentCatalog,
  { models, installed }: { models: readonly ModelId[]; installed: ReadonlySet<string> },
): Component[] {
  const wanted = modelIds.filter((id) => models.includes(id)).map((id) => catalog.models[id]);
  return [...catalog.shared, ...wanted].filter((component) => !installed.has(component.id));
}
