// Builds the npm package `interview-sensei` into apps/server/dist/package from the server and core
// sources and the built web app. Run it after the web build: `pnpm build` runs both.
//
// The package keeps the repository layout: apps/server/src, packages/core/src and apps/web/dist.
// So every path that the sources build from import.meta.dirname, such as the migrations, the fake
// agent and the built web app, holds in the package without changes.
import { cp, mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { isBuiltin } from "node:module";
import path from "node:path";

import { build } from "rolldown";
import type { OutputChunk } from "rolldown";

const repository = path.join(import.meta.dirname, "..", "..", "..");
const output = path.join(import.meta.dirname, "..", "dist", "package");

/** Node runs the command; the fake agent is a separate program that the server starts. */
const entries = [
  "apps/server/src/launch.ts",
  "packages/core/src/features/agent-runtime/infrastructure/fake-agent.ts",
];

/** The built web app and the application's skills, the output of the web build. */
const builtWebApp = ["apps/web/dist/web", "apps/web/dist/skills"];

/**
 * The oldest Node the package runs on. Since 22.15, node:sqlite opens a database by a file URL,
 * which the OpenCode credentials reader needs for its `immutable` parameter.
 */
const nodeVersion = "22.15.0";

/** The manifest fields the package takes from a workspace. */
interface Manifest {
  readonly version: string;
  readonly dependencies: Readonly<Record<string, string>>;
}

function isStringRecord(value: unknown): value is Record<string, string> {
  return (
    typeof value === "object" &&
    value !== null &&
    Object.values(value).every((entry) => typeof entry === "string")
  );
}

async function manifest(workspace: string): Promise<Manifest> {
  const text = await readFile(path.join(repository, workspace, "package.json"), "utf8");
  const parsed: unknown = JSON.parse(text);
  if (typeof parsed !== "object" || parsed === null) {
    throw new Error(`${workspace}/package.json is not an object`);
  }
  const version = "version" in parsed ? parsed.version : undefined;
  const dependencies = "dependencies" in parsed ? parsed.dependencies : {};
  if (typeof version !== "string" || !isStringRecord(dependencies)) {
    throw new Error(`${workspace}/package.json has no version or a wrong dependencies field`);
  }
  return { version, dependencies };
}

/** The third-party dependencies of the server and core, with their exact versions. */
function runtimeDependencies(workspaces: readonly Manifest[]): Record<string, string> {
  const dependencies = workspaces
    .flatMap((workspace) => Object.entries(workspace.dependencies))
    .filter(([, version]) => !version.startsWith("workspace:"))
    .toSorted(([first], [second]) => first.localeCompare(second));
  return Object.fromEntries(dependencies);
}

/** The package name of a bare import: `fastify` or `@fastify/static` from `@fastify/static/x`. */
function packageName(specifier: string): string {
  const parts = specifier.split("/");
  return (specifier.startsWith("@") ? parts.slice(0, 2) : parts.slice(0, 1)).join("/");
}

function isBare(specifier: string): boolean {
  return !specifier.startsWith(".") && !path.isAbsolute(specifier);
}

/** The packages the chunks import, besides Node's built-in modules. */
function importedPackages(chunks: readonly OutputChunk[]): Set<string> {
  // A chunk's imports name the other chunks by file name beside the external packages.
  const ownFiles = new Set(chunks.map((chunk) => chunk.fileName));
  const imported = [
    ...chunks.flatMap((chunk) => chunk.imports),
    ...chunks.flatMap((chunk) => chunk.dynamicImports),
  ];
  return new Set(
    imported
      .filter((specifier) => !ownFiles.has(specifier) && !isBuiltin(specifier))
      .map((specifier) => packageName(specifier)),
  );
}

/** Compiles the sources to JavaScript module by module; returns the packages they import. */
async function compile(): Promise<Set<string>> {
  const result = await build({
    cwd: repository,
    input: entries,
    platform: "node",
    // Core is part of the package; every other package is a dependency that npm installs.
    external: (specifier) => isBare(specifier) && !specifier.startsWith("@interview-sensei/"),
    transform: { target: `node${nodeVersion}` },
    output: {
      dir: output,
      format: "esm",
      preserveModules: true,
      preserveModulesRoot: repository,
    },
  });
  return importedPackages(result.output.filter((file) => file.type === "chunk"));
}

async function isDirectory(directory: string): Promise<boolean> {
  try {
    const entry = await stat(directory);
    return entry.isDirectory();
  } catch {
    return false;
  }
}

/** The migration directories of every core slice that stores data, relative to the repository. */
async function sliceMigrations(): Promise<string[]> {
  const features = "packages/core/src/features";
  const slices = await readdir(path.join(repository, features));
  const directories = slices.map((slice) => `${features}/${slice}/infrastructure/migrations`);
  const exists = await Promise.all(
    directories.map(async (directory) => isDirectory(path.join(repository, directory))),
  );
  return directories.filter((_directory, index) => exists[index] === true);
}

/** Copies files and directories of the repository to the same places in the package. */
async function copyToPackage(relativePaths: readonly string[]): Promise<void> {
  await Promise.all(
    relativePaths.map(async (relative) =>
      cp(path.join(repository, relative), path.join(output, relative), { recursive: true }),
    ),
  );
}

/** The package manifest: the server's version and the third-party dependencies it runs with. */
async function packageManifest(imported: ReadonlySet<string>) {
  const [server, core] = await Promise.all([manifest("apps/server"), manifest("packages/core")]);
  const dependencies = runtimeDependencies([server, core]);
  const undeclared = [...imported].filter((name) => !Object.hasOwn(dependencies, name));
  if (undeclared.length > 0) {
    throw new Error(`The package imports undeclared dependencies: ${undeclared.join(", ")}`);
  }
  return {
    name: "interview-sensei",
    version: server.version,
    description:
      "Локальная подготовка к техническим собеседованиям с агентом, которым вы уже пользуетесь.",
    license: "MIT",
    repository: { type: "git", url: "git+https://github.com/KirillSachkov/interview-sensei.git" },
    type: "module",
    bin: { "interview-sensei": "apps/server/src/launch.js" },
    engines: { node: `>=${nodeVersion}` },
    dependencies,
  };
}

async function main(): Promise<void> {
  const built = await Promise.all(
    builtWebApp.map(async (part) => isDirectory(path.join(repository, part))),
  );
  if (built.includes(false)) {
    throw new Error(`No ${builtWebApp.join(" or ")}: build the web app first.`);
  }
  await rm(output, { recursive: true, force: true });
  await mkdir(output, { recursive: true });
  const packageJson = await packageManifest(await compile());
  await copyToPackage([...(await sliceMigrations()), ...builtWebApp, "README.md", "LICENSE"]);
  await writeFile(path.join(output, "package.json"), `${JSON.stringify(packageJson, null, 2)}\n`);
  process.stdout.write(`Built ${packageJson.name}@${packageJson.version} in ${output}\n`);
}

await main();
