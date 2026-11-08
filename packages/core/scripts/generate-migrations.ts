// Generates the drizzle-kit migrations of every core slice that stores data:
// `pnpm --filter @interview-sensei/core db:generate [--name <name>]`.
// A slice has `src/features/<slice>/infrastructure/drizzle.config.ts`. Extra arguments go to
// `drizzle-kit generate` for each slice.
import { spawn } from "node:child_process";
import { once } from "node:events";
import { glob, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const packageDirectory = path.join(import.meta.dirname, "..");
const drizzleKit = path.join(packageDirectory, "node_modules", ".bin", "drizzle-kit");

// The migrator creates the slice's schema before the first migration, because its history table
// lives there; drizzle-kit writes a plain CREATE SCHEMA, which would then fail.
const createSchema = /^CREATE SCHEMA "(?<schema>[^"]+)";/gmu;

async function makeSchemaCreationIdempotent(migrationsFolder: string): Promise<void> {
  for await (const file of glob(path.join(migrationsFolder, "*.sql"))) {
    const sql = await readFile(file, "utf8");
    const fixed = sql.replaceAll(createSchema, 'CREATE SCHEMA IF NOT EXISTS "$<schema>";');
    if (fixed !== sql) {
      await writeFile(file, fixed);
    }
  }
}

async function generate(config: string): Promise<void> {
  const drizzle = spawn(drizzleKit, ["generate", "--config", config, ...process.argv.slice(2)], {
    cwd: packageDirectory,
    stdio: "inherit",
  });
  await once(drizzle, "exit");
  if (drizzle.exitCode !== 0) {
    throw new Error(`drizzle-kit generate failed for ${config}`);
  }
  await makeSchemaCreationIdempotent(
    path.join(packageDirectory, path.dirname(config), "migrations"),
  );
}

const configs: string[] = [];
for await (const config of glob("src/features/*/infrastructure/drizzle.config.ts", {
  cwd: packageDirectory,
})) {
  configs.push(config);
}
for (const config of configs.toSorted()) {
  // oxlint-disable-next-line eslint/no-await-in-loop -- one slice after another keeps the output readable
  await generate(config);
}
