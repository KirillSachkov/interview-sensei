// The components of recognition in `transcription/<component>/` of the data directory. Each file is
// downloaded to a `.part` file, checked against the pinned size and SHA-256, then unpacked.
// `.installed` records the version once every file of the component is in place.
import { chmod, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { gunzip } from "node:zlib";

import type { Component, ComponentFile } from "../domain/components.ts";
import type { ComponentStore } from "../domain/ports.ts";
import { TranscriptionError } from "../domain/recognition.ts";
import { download } from "./download.ts";
import { tarFiles } from "./tar.ts";

const gunzipped = promisify(gunzip);

/** The directory of the components in the data directory. */
export function componentsDirectory(dataDirectory: string): string {
  return path.join(dataDirectory, "transcription");
}

/** Writes the files of an npm package tarball, its `package/` directory as `target`. */
async function unpackPackage(downloaded: string, target: string): Promise<void> {
  const archive = await gunzipped(await readFile(downloaded));
  for (const entry of tarFiles(archive)) {
    const place = path.join(target, ...entry.name.replace(/^package\//u, "").split("/"));
    // oxlint-disable-next-line eslint/no-await-in-loop -- a package has a few files
    await mkdir(path.dirname(place), { recursive: true });
    // oxlint-disable-next-line eslint/no-await-in-loop -- a package has a few files
    await writeFile(place, entry.bytes, { mode: entry.mode & 0o777 });
  }
}

/** Puts the checked download in its place in the component's directory. */
async function unpack(file: ComponentFile, downloaded: string, directory: string): Promise<void> {
  const target = path.join(directory, ...file.path.split("/"));
  await mkdir(path.dirname(target), { recursive: true });
  const unpackers = {
    none: async () => rename(downloaded, target),
    gunzip: async () => writeFile(target, await gunzipped(await readFile(downloaded))),
    "npm-package": async () => unpackPackage(downloaded, target),
  } as const;
  await unpackers[file.unpack]();
  await rm(downloaded, { force: true });
  if (file.executable === true) {
    await chmod(target, 0o755);
  }
}

/** Downloads, checks and unpacks one file; a file whose SHA-256 differs is deleted. */
async function installFile(
  { component, file, directory }: { component: Component; file: ComponentFile; directory: string },
  progress: { onBytes: (bytes: number) => void; signal: AbortSignal },
): Promise<void> {
  const downloaded = path.join(directory, `${path.basename(file.path)}.part`);
  const got = await download(file, downloaded, progress);
  if (got.sha256 !== file.sha256 || got.size !== file.size) {
    await rm(directory, { recursive: true, force: true });
    throw new TranscriptionError(
      `контрольная сумма не совпала у ${component.id}/${file.path}: файл удалён`,
    );
  }
  await unpack(file, downloaded, directory);
}

const markerName = ".installed";

/** The store of the components under `transcription/` of the data directory. */
export function componentStore(dataDirectory: string): ComponentStore {
  const root = componentsDirectory(dataDirectory);
  const versionOf = async (component: Component) => {
    try {
      return await readFile(path.join(root, component.id, markerName), "utf8");
    } catch {
      return null;
    }
  };
  return {
    installed: async (catalog) => {
      const versions = await Promise.all(catalog.map(async (component) => versionOf(component)));
      const current = catalog.filter((component, index) => versions[index] === component.version);
      return new Set(current.map((component) => component.id));
    },
    install: async (component, progress) => {
      const directory = path.join(root, component.id);
      await rm(directory, { recursive: true, force: true });
      await mkdir(directory, { recursive: true });
      for (const file of component.files) {
        // oxlint-disable-next-line eslint/no-await-in-loop -- one file at a time keeps the progress honest
        await installFile({ component, file, directory }, progress);
      }
      await writeFile(path.join(directory, markerName), component.version);
    },
    remove: async (component) => {
      await rm(path.join(root, component.id), { recursive: true, force: true });
    },
  };
}
