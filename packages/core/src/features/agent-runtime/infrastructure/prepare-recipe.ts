import {
  chmod,
  lstat,
  mkdir,
  readdir,
  readlink,
  realpath,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import path from "node:path";

import type { LaunchRecipe } from "../domain/launch-recipe.ts";

/** What is at the path itself, without following a link; null when nothing is. */
async function entryAt(file: string) {
  try {
    return await lstat(file);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

/**
 * The names from the data directory down to the directory that holds the recipe's path, the
 * path itself excluded. Throws when the path lies outside the data directory.
 */
function namesBelow(dataDirectory: string, location: string): string[] {
  const relative = path.relative(dataDirectory, path.dirname(location));
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`The recipe's path ${location} is outside the data directory`);
  }
  return relative === "" ? [] : relative.split(path.sep);
}

/**
 * Refuses a path whose existing parents inside the data directory are links or not directories,
 * so `mkdir` and writes cannot follow a link into the Candidate's directories. The data
 * directory itself may be a link: it is resolved first.
 */
async function checkParents(dataDirectory: string, location: string): Promise<void> {
  let current = await realpath(dataDirectory);
  for (const name of namesBelow(dataDirectory, location)) {
    current = path.join(current, name);
    // oxlint-disable-next-line eslint/no-await-in-loop -- each parent holds the next one
    const entry = await entryAt(current);
    if (entry === null) {
      return;
    }
    if (entry.isSymbolicLink()) {
      throw new Error(`The recipe's directory ${current} is a link`);
    }
    if (!entry.isDirectory()) {
      throw new Error(`The recipe's directory ${current} is not a directory`);
    }
  }
}

/** Checks every path of the recipe before anything is created. */
async function checkRecipe(recipe: LaunchRecipe): Promise<void> {
  const locations = [
    // A directory is checked as the parent of a name inside it, so it may not be a link either.
    ...[...recipe.directories, ...recipe.syncedDirectories].map((directory) =>
      path.join(directory, "_"),
    ),
    ...recipe.files.map((file) => file.path),
    ...recipe.symlinks.map((link) => link.path),
  ];
  for (const location of locations) {
    // oxlint-disable-next-line eslint/no-await-in-loop -- refuses at the first bad path
    await checkParents(recipe.dataDirectory, location);
  }
}

/**
 * Writes the file in place of whatever is at its path, readable only by the Candidate. A link
 * there is removed first, so the write never follows it out of the data directory.
 */
async function writeOwnFile({ path: file, content }: LaunchRecipe["files"][number]): Promise<void> {
  const entry = await entryAt(file);
  if (entry?.isSymbolicLink() === true) {
    await rm(file);
  }
  await writeFile(file, content, { mode: 0o600 });
  // `mode` applies only to a new file.
  await chmod(file, 0o600);
}

/**
 * Points the link at the Candidate's file. Only a file or a link at the exact path is replaced; a
 * directory there is refused, never removed.
 */
async function linkUserFile({
  path: link,
  target,
}: LaunchRecipe["symlinks"][number]): Promise<void> {
  const entry = await entryAt(link);
  if (entry?.isSymbolicLink() === true && (await readlink(link)) === target) {
    return;
  }
  if (entry?.isDirectory() === true) {
    throw new Error(`A directory is in place of the recipe's link ${link}`);
  }
  if (entry !== null) {
    await rm(link);
  }
  await symlink(target, link);
}

/**
 * Removes from `directory` every entry that `kept` does not name; a link is removed itself, never
 * followed. Entries of the current recipe stay, so a session already running keeps its copy.
 */
async function removeOthers(directory: string, kept: ReadonlySet<string>): Promise<void> {
  const entries = await readdir(directory, { withFileTypes: true });
  await Promise.all(
    entries.map(async (entry) => {
      const location = path.join(directory, entry.name);
      if (!kept.has(location)) {
        await rm(location, { recursive: true, force: true });
      } else if (entry.isDirectory()) {
        await removeOthers(location, kept);
      }
    }),
  );
}

/**
 * Creates the directories, files and links of the recipe, then removes whatever else lies in its
 * synced directories. It refuses a recipe whose paths lie outside the data directory or go
 * through a link inside it.
 */
export async function prepareRecipe(recipe: LaunchRecipe): Promise<void> {
  await checkRecipe(recipe);
  for (const directory of recipe.directories) {
    // oxlint-disable-next-line eslint/no-await-in-loop -- a directory may hold the next one
    await mkdir(directory, { recursive: true, mode: 0o700 });
  }
  await Promise.all(recipe.files.map(async (file) => writeOwnFile(file)));
  await Promise.all(recipe.symlinks.map(async (link) => linkUserFile(link)));
  const kept = new Set(
    [...recipe.directories, ...recipe.files.map((file) => file.path)].map((location) =>
      path.resolve(location),
    ),
  );
  await Promise.all(
    recipe.syncedDirectories.map(async (directory) => removeOthers(path.resolve(directory), kept)),
  );
}
