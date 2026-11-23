import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

const root = mkdtempSync(join(tmpdir(), "sensei-rules-"));
function put(file: string, text: string) {
  mkdirSync(join(root, dirname(file)), { recursive: true });
  writeFileSync(join(root, file), text);
}
function verify(command: string, args: string[], diagnostics: string[] = []) {
  const result = spawnSync(command, args, { cwd: root, encoding: "utf8" });
  const output = result.stdout + result.stderr;
  assert.ok(
    result.status !== null &&
      (diagnostics.length ? result.status > 0 : result.status === 0),
    output,
  );
  for (const message of diagnostics)
    assert.ok(output.includes(message), output);
}
try {
  symlinkSync(resolve("node_modules"), join(root, "node_modules"), "dir");
  copyFileSync(
    ".dependency-cruiser.cjs",
    join(root, ".dependency-cruiser.cjs"),
  );
  put(
    "tsconfig.json",
    JSON.stringify({
      extends: resolve("tsconfig.json"),
      compilerOptions: {
        module: "ESNext",
        moduleResolution: "Bundler",
        paths: { "@server/*": ["./apps/server/*"] },
      },
      include: ["apps"],
    }),
  );
  const src = "apps/server/src/modules/goals-and-scenarios";
  put(src + "/internal.ts", "export type Id = string;");
  put(src + "/index.ts", 'export type { Id } from "./internal";');
  put(
    "apps/server/src/api.ts",
    'export type { Id } from "./modules/goals-and-scenarios";',
  );
  const cruise = resolve("node_modules/.bin/depcruise");
  verify(cruise, ["apps"]);
  put(
    "apps/server/src/api.ts",
    'export type { Id } from "./modules/goals-and-scenarios/internal";',
  );
  put("packages/bridge/index.ts", 'export type { Id } from "@server/src/api";');
  put(
    "apps/web/src/leak.ts",
    'export type { Id } from "../../../packages/bridge";',
  );
  put(src + "/foreign.ts", 'export type { Note } from "../materials/private";');
  put(
    "apps/server/src/modules/materials/private.ts",
    "export type Note = string;",
  );
  verify(
    cruise,
    ["apps"],
    ["public-module-entry", "web-boundary", "domain-isolation", "leak.ts"],
  );
  put("packages/contracts/src/leak.ts", 'export * from "@server/src/api";');
  put("apps/web/src/missing.ts", 'export * from "./missing-file";');
  verify(
    cruise,
    ["apps", "packages"],
    ["contracts-standalone", "resolved-import"],
  );
  put(src + "/internal.ts", 'import "./index"; export type Id = string;');
  verify(cruise, ["apps"], ["no-cycles"]);
  put("apps/web/src/wrong.ts", "export const value: number = [1][2];");
  verify(resolve("node_modules/.bin/tsc"), ["-p", "."], ["TS2322", "wrong.ts"]);
  symlinkSync(
    resolve("apps/web/node_modules"),
    join(root, "apps/web/node_modules"),
    "dir",
  );
  put(
    "apps/web/src/effect.ts",
    'import { useEffect as mount } from "react"; mount(() => {});',
  );
  put(
    "apps/web/src/destructure.ts",
    'import * as React from "react"; const { useEffect: attach } = React; attach(() => {});',
  );
  put(
    "apps/web/src/adapters/subscribe.ts",
    'import { useEffect } from "react"; export const useSubscribe = (subscribe: () => () => void) => useEffect(subscribe, [subscribe]);',
  );
  put("tests/adapters/subscribe.lifecycle.test.ts", "export {};");
  verify(process.execPath, [
    resolve("tools/source-rules.ts"),
    "apps/web/src/adapters/subscribe.ts",
  ]);
  put("tools/valid.js", 'export const url = "https://example.test";');
  verify(process.execPath, [
    resolve("tools/source-rules.ts"),
    "tools/valid.js",
  ]);
  put("tools/config.js", "// eslint-disable-next-line\nexport {};");
  verify(
    process.execPath,
    [
      resolve("tools/source-rules.ts"),
      "tools/config.js",
      "apps/web/src/effect.ts",
      "apps/web/src/destructure.ts",
    ],
    [
      "config.js no-comments",
      "effect.ts no-direct-effect",
      "destructure.ts no-direct-effect",
    ],
  );
  console.log(
    "Verified public-module-entry, web-boundary, no-cycles, TS2322, no-comments, no-direct-effect",
  );
} finally {
  rmSync(root, { recursive: true, force: true });
}
