// The preparation of a launch recipe on the real disk. A temporary data directory stands for the
// server's; other temporary directories stand for the Candidate's own agent directories, which
// must stay untouched.
import {
  chmod,
  lstat,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  readlink,
  rm,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it, onTestFinished } from "vitest";

import type { LaunchRecipe } from "../domain/launch-recipe.ts";
import { prepareRecipe } from "./prepare-recipe.ts";

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), "interview-sensei-prepare-"));
  onTestFinished(async () => {
    await rm(directory, { recursive: true, force: true });
  });
  return directory;
}

/** A data directory, an agent home inside it, and a file outside that stands for a login. */
async function setup(loginContent = "token") {
  const dataDirectory = await temporaryDirectory();
  const home = path.join(dataDirectory, "agents", "fake");
  const login = path.join(await temporaryDirectory(), "auth.json");
  await writeFile(login, loginContent);
  /** The recipe with only the parts that preparation reads. */
  const recipe = (parts: Partial<LaunchRecipe>): LaunchRecipe => ({
    command: "unused",
    args: [],
    env: {},
    sessionMeta: null,
    systemPrompt: null,
    additionalDirectories: [],
    mode: null,
    cwd: home,
    dataDirectory,
    directories: [home],
    files: [],
    symlinks: [],
    syncedDirectories: [],
    ...parts,
  });
  return { dataDirectory, home, login, recipe };
}

describe("recipe preparation", () => {
  it("replaces a link at a file's path instead of writing through it", async () => {
    const { home, login: userConfig, recipe } = await setup("the Candidate's own config");
    await mkdir(home, { recursive: true });
    await symlink(userConfig, path.join(home, "config.toml"));

    await prepareRecipe(
      recipe({ files: [{ path: path.join(home, "config.toml"), content: "ours" }] }),
    );

    await expect(readFile(userConfig, "utf8")).resolves.toBe("the Candidate's own config");
    const entry = await lstat(path.join(home, "config.toml"));
    expect(entry.isSymbolicLink()).toBe(false);
    await expect(readFile(path.join(home, "config.toml"), "utf8")).resolves.toBe("ours");
  });

  it("puts the link back where a copy of the Candidate's login appeared", async () => {
    const { home, login, recipe } = await setup("fresh token");
    await mkdir(home, { recursive: true });
    await writeFile(path.join(home, "auth.json"), "stale copy");

    await prepareRecipe(
      recipe({ symlinks: [{ path: path.join(home, "auth.json"), target: login }] }),
    );

    await expect(readlink(path.join(home, "auth.json"))).resolves.toBe(login);
    await expect(readFile(login, "utf8")).resolves.toBe("fresh token");
  });

  it("makes an own file that already exists readable only by the Candidate again", async () => {
    const { home, recipe } = await setup();
    await mkdir(home, { recursive: true });
    await writeFile(path.join(home, "config.toml"), "old");
    await chmod(path.join(home, "config.toml"), 0o644);

    await prepareRecipe(
      recipe({ files: [{ path: path.join(home, "config.toml"), content: "ours" }] }),
    );

    const entry = await stat(path.join(home, "config.toml"));
    expect(entry.mode & 0o777).toBe(0o600);
  });

  it("refuses a parent of a recipe directory that is a link and creates nothing through it", async () => {
    const { home, recipe } = await setup();
    const linked = await temporaryDirectory();
    await symlink(linked, path.dirname(home));

    await expect(
      prepareRecipe(recipe({ files: [{ path: path.join(home, "config.toml"), content: "ours" }] })),
    ).rejects.toThrow(/is a link/u);
    await expect(readdir(linked)).resolves.toStrictEqual([]);
  });

  it("refuses a recipe path outside the data directory", async () => {
    const { recipe } = await setup();
    const elsewhere = path.join(await temporaryDirectory(), "config.toml");

    await expect(
      prepareRecipe(recipe({ files: [{ path: elsewhere, content: "ours" }] })),
    ).rejects.toThrow(/outside the data directory/u);
    await expect(stat(elsewhere)).rejects.toThrow(/ENOENT/u);
  });

  it("refuses to replace a directory at a link's path and keeps what it holds", async () => {
    const { home, login, recipe } = await setup();
    await mkdir(path.join(home, "auth.json"), { recursive: true });
    await writeFile(path.join(home, "auth.json", "keep.txt"), "kept");

    await expect(
      prepareRecipe(recipe({ symlinks: [{ path: path.join(home, "auth.json"), target: login }] })),
    ).rejects.toThrow(/directory/u);
    await expect(readFile(path.join(home, "auth.json", "keep.txt"), "utf8")).resolves.toBe("kept");
  });

  it("accepts a data directory that is itself a link", async () => {
    const { dataDirectory, recipe } = await setup();
    const linkedData = path.join(await temporaryDirectory(), "data");
    await symlink(dataDirectory, linkedData);
    const home = path.join(linkedData, "agents", "fake");

    await prepareRecipe(
      recipe({
        dataDirectory: linkedData,
        directories: [home],
        files: [{ path: path.join(home, "config.toml"), content: "ours" }],
      }),
    );

    await expect(
      readFile(path.join(dataDirectory, "agents", "fake", "config.toml"), "utf8"),
    ).resolves.toBe("ours");
  });
});
