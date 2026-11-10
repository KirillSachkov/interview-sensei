import { randomUUID } from "node:crypto";

import type { Transaction } from "../../../shared/storage/index.ts";
import type { Clock } from "../../../shared/time/index.ts";
import type { SourceRepository, SourceTargets } from "../domain/ports.ts";
import type { SourceFiles } from "../domain/source-files.ts";
import { maxFileBytes, safeFileName, withoutControlCharacters } from "../domain/source.ts";
import type { Source, SourceType } from "../domain/source.ts";

export interface SourcesDependencies {
  readonly repository: SourceRepository<Transaction>;
  readonly files: SourceFiles;
  readonly targets: SourceTargets<Transaction>;
  readonly clock: Clock;
}

/** A Source as the Candidate and the agent see it: its file by absolute path. */
export interface SourceView extends Omit<Source, "file"> {
  /** The absolute path of the file in the data directory; null for a link. */
  readonly path: string | null;
}

/** A file the Candidate attached: its name from the browser and its bytes. */
export interface AttachedFile {
  readonly name: string;
  readonly bytes: AsyncIterable<Uint8Array>;
  /** The size the request declares, when it does. */
  readonly size?: number | undefined;
}

/** A link or a note that the agent took from the Candidate's text. */
export type NewSource =
  | { readonly type?: SourceType | undefined; readonly title: string; readonly url: string }
  | { readonly type?: SourceType | undefined; readonly title: string; readonly text: string };

/**
 * - `saved`: the file is in the Target's data directory, and its Source waits in the Inbox.
 * - `not_found`: no Target has this id.
 * - `too_large`: the file is larger than 100 MB; nothing is kept.
 */
export type SaveOutcome =
  | { readonly outcome: "saved"; readonly source: SourceView }
  | { readonly outcome: "not_found" }
  | { readonly outcome: "too_large" };

function viewOf(files: SourceFiles, { file, ...source }: Source): SourceView {
  return { ...source, path: file === null ? null : files.absolute(file) };
}

/** Writes the file, then its Source; a failed write keeps neither. */
async function store(
  { repository, files, clock }: SourcesDependencies,
  source: Omit<Source, "file" | "status" | "failure" | "parts" | "progress" | "createdAt">,
  { name, bytes }: { name: string; bytes: AttachedFile["bytes"] | Iterable<Uint8Array> },
): Promise<Source | null> {
  const place = { targetId: source.targetId, sourceId: source.id, name: safeFileName(name) };
  const file = await files.save(place, bytes, maxFileBytes);
  if (file === null) {
    return null;
  }
  const stored: Source = {
    ...source,
    file,
    status: "inbox",
    failure: null,
    parts: null,
    progress: null,
    createdAt: clock.now().toISOString(),
  };
  try {
    await repository.add(stored);
  } catch (error) {
    await files.remove(file);
    throw error;
  }
  return stored;
}

async function saveFile(
  dependencies: SourcesDependencies,
  targetId: string,
  attached: AttachedFile,
): Promise<SaveOutcome> {
  if ((await dependencies.targets.get(targetId)) === undefined) {
    return { outcome: "not_found" };
  }
  if (attached.size !== undefined && attached.size > maxFileBytes) {
    return { outcome: "too_large" };
  }
  const source = await store(
    dependencies,
    { id: randomUUID(), targetId, type: "file", title: safeFileName(attached.name), url: null },
    attached,
  );
  return source === null
    ? { outcome: "too_large" }
    : { outcome: "saved", source: viewOf(dependencies.files, source) };
}

/** Stores a link as it is and the text of a note as a file in the Target's data directory. */
async function addOne(dependencies: SourcesDependencies, targetId: string, added: NewSource) {
  const common = { id: randomUUID(), targetId, title: withoutControlCharacters(added.title) };
  if ("url" in added) {
    const source: Source = {
      ...common,
      type: added.type ?? "link",
      url: added.url,
      file: null,
      status: "inbox",
      failure: null,
      parts: null,
      progress: null,
      createdAt: dependencies.clock.now().toISOString(),
    };
    await dependencies.repository.add(source);
    return source;
  }
  const source = await store(
    dependencies,
    { ...common, type: added.type ?? "note", url: null },
    { name: `${added.title}.md`, bytes: [new TextEncoder().encode(added.text)] },
  );
  if (source === null) {
    throw new Error("The note is larger than 100 MB");
  }
  return source;
}

/**
 * Removes the files of Targets that no longer exist: a server that stopped after a Target's
 * deletion and before `eraseTargetFiles` left them.
 */
async function removeLeftovers({ files, targets }: SourcesDependencies): Promise<void> {
  const targetIds = await files.targetIds();
  const exist = await Promise.all(
    targetIds.map(async (id) => (await targets.get(id)) !== undefined),
  );
  await Promise.all(
    targetIds
      .filter((_id, index) => exist[index] === false)
      .map(async (id) => files.removeTarget(id)),
  );
}

/**
 * Gives the Target's Source the type, such as a vacancy for an attached file, which is a «файл»
 * until the agent reads it; undefined when the Target has no such Source.
 */
async function typed(
  { repository, files }: SourcesDependencies,
  { targetId, id }: { targetId: string; id: string },
  type: SourceView["type"],
): Promise<SourceView | undefined> {
  const source = await repository.get(targetId, id);
  if (source === undefined) {
    return source;
  }
  await repository.setType(targetId, id, type);
  return viewOf(files, { ...source, type });
}

/** The materials of each Target: files in the data directory and links. */
export function createSources(dependencies: SourcesDependencies) {
  const { repository, files, targets } = dependencies;
  return {
    /** Erases the Target's Sources when the Target is deleted for good; the files go after. */
    eraseTarget: async (targetId: string, transaction: Transaction) =>
      repository.erase(targetId, transaction),
    eraseTargetFiles: async (targetId: string) => files.removeTarget(targetId),
    removeLeftovers: async () => removeLeftovers(dependencies),
    /** The Target's Sources in the order they were added; undefined for an unknown Target. */
    list: async (targetId: string): Promise<SourceView[] | undefined> => {
      if ((await targets.get(targetId)) === undefined) {
        return undefined;
      }
      const stored = await repository.list(targetId);
      return stored.map((source) => viewOf(files, source));
    },
    /** The Target's Source; undefined for another Target's Source and an unknown one. */
    get: async (targetId: string, id: string): Promise<SourceView | undefined> => {
      const source = await repository.get(targetId, id);
      return source === undefined ? undefined : viewOf(files, source);
    },
    /** Adds links and notes in order; undefined for an unknown Target. */
    add: async (
      targetId: string,
      added: readonly NewSource[],
    ): Promise<SourceView[] | undefined> => {
      if ((await targets.get(targetId)) === undefined) {
        return undefined;
      }
      const stored: SourceView[] = [];
      for (const source of added) {
        // oxlint-disable-next-line eslint/no-await-in-loop -- the Sources keep the order of the input
        stored.push(viewOf(files, await addOne(dependencies, targetId, source)));
      }
      return stored;
    },
    setType: async (targetId: string, id: string, type: SourceView["type"]) =>
      typed(dependencies, { targetId, id }, type),
    /** Saves an attached file of up to 100 MB in the Target's data directory as a Source. */
    saveFile: async (targetId: string, attached: AttachedFile) =>
      saveFile(dependencies, targetId, attached),
  };
}
export type Sources = ReturnType<typeof createSources>;
