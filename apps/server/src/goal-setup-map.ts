import { readFile, writeFile } from "node:fs/promises";
import { goalSetupMap } from "./modules/agent-execution/index.js";

const file = "docs/goal-setup-graph.md";
const contents = "```mermaid\n" + goalSetupMap().trimEnd() + "\n```\n";

if (process.argv.includes("--check")) {
  if ((await readFile(file, "utf8")) !== contents) {
    console.error(
      `${file} is out of date. Run pnpm goal-setup:map after building.`,
    );
    process.exitCode = 1;
  }
} else {
  await writeFile(file, contents);
}
