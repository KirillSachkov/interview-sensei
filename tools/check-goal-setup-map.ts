import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const script = resolve("apps/server/dist/goal-setup-map.js");
const checkMap = (cwd: string) =>
  spawnSync(process.execPath, [script, "--check"], { cwd, encoding: "utf8" });
const current = checkMap(process.cwd());
assert.equal(current.status, 0, current.stderr);

const fixture = mkdtempSync(join(tmpdir(), "sensei-map-"));
try {
  mkdirSync(join(fixture, "docs"));
  writeFileSync(
    join(fixture, "docs/goal-setup-graph.md"),
    "```mermaid\ngraph TD;\n  __start__ --> show_proposal;\n```\n",
  );
  const stale = checkMap(fixture);
  assert.equal(stale.status, 1, stale.stderr);
  assert.match(stale.stderr, /docs\/goal-setup-graph\.md is out of date/);
} finally {
  rmSync(fixture, { recursive: true, force: true });
}
console.log("Verified the goal setup map and its stale-map diagnostic");
