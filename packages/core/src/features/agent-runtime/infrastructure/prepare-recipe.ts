import { lstat, mkdir, readlink, rm, symlink, writeFile } from "node:fs/promises";

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
 * Writes the file in place of whatever is at its path. A link there is removed first, so the
 * write never follows it out of the data directory.
 */
async function writeOwnFile({ path, content }: LaunchRecipe["files"][number]): Promise<void> {
  const entry = await entryAt(path);
  if (entry?.isSymbolicLink() === true) {
    await rm(path);
  }
  await writeFile(path, content, { mode: 0o600 });
}

/** Points the link at the Candidate's file; a file in its place is replaced, never copied. */
async function linkUserFile({ path, target }: LaunchRecipe["symlinks"][number]): Promise<void> {
  const entry = await entryAt(path);
  if (entry?.isSymbolicLink() === true && (await readlink(path)) === target) {
    return;
  }
  if (entry !== null) {
    await rm(path, { recursive: true });
  }
  await symlink(target, path);
}

/** Creates the directories, files and links of the recipe; all of them are in the data directory. */
export async function prepareRecipe(recipe: LaunchRecipe): Promise<void> {
  for (const directory of recipe.directories) {
    // oxlint-disable-next-line eslint/no-await-in-loop -- a directory may hold the next one
    await mkdir(directory, { recursive: true, mode: 0o700 });
  }
  await Promise.all(recipe.files.map(async (file) => writeOwnFile(file)));
  await Promise.all(recipe.symlinks.map(async (link) => linkUserFile(link)));
}
