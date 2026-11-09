import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import type { SkillSource } from "../domain/launch-recipe.ts";

/** A skill name is one directory name: no separators, no `..`. */
function checkName(name: string): void {
  if (!/^[a-z0-9][a-z0-9-]*$/u.test(name)) {
    throw new Error(`The skill name ${name} is not a directory name`);
  }
}

/**
 * Reads the application's skills from `skillsDirectory`, the repository's `skills/`. Each read
 * takes the files as they are now, so the next session gets a changed skill.
 */
export function skillDirectory(skillsDirectory: string): (name: string) => Promise<SkillSource> {
  return async (name) => {
    checkName(name);
    const directory = path.join(skillsDirectory, name);
    const entries = await readdir(directory, { recursive: true, withFileTypes: true });
    const files = await Promise.all(
      entries
        .filter((entry) => entry.isFile())
        .map(async (entry) => {
          const file = path.join(entry.parentPath, entry.name);
          return {
            path: path.relative(directory, file).split(path.sep).join("/"),
            content: await readFile(file, "utf8"),
          };
        }),
    );
    if (!files.some((file) => file.path === "SKILL.md")) {
      throw new Error(`The skill ${name} has no SKILL.md in ${directory}`);
    }
    return { name, files: files.toSorted((left, right) => left.path.localeCompare(right.path)) };
  };
}
