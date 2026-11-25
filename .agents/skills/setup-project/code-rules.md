# Code rules as checks

A rule with a fixed shape becomes a check in the project's own linter, run by the command the delivery checks name. An agent that breaks it sees the failure and fixes it before review; a rule kept as prose is followed unevenly. `CODING_STANDARDS.md` holds only what takes judgement.

For every check you add:

- Run it on an example that breaks the rule and see it fail with a message that says what to do instead. A check never seen failing proves nothing.
- Give the rule its one honest exception as a place in the code, not a comment that switches it off.
- Wire it into the project's single check command, so CI and local runs cannot drift.

The examples are for TypeScript and React with ESLint's flat config. Other linters (oxlint, Biome) carry most of these rules under the same names: read the linter's own rule list before writing a custom one. For another language, keep the method and find the rule in that language's linter.

## No `any`

```js
// eslint.config.js
{ rules: { "@typescript-eslint/no-explicit-any": "error" } }
```

Add the `no-unsafe-*` family (`no-unsafe-assignment`, `no-unsafe-call`, `no-unsafe-member-access`, `no-unsafe-return`, `no-unsafe-argument`) when the linter runs type-aware; without them an `any` that arrives from a library passes unseen.

## No direct `useEffect`

Components compute during render and act in event handlers. A subscription to something outside React lives in a named hook in one folder, which is the exception.

```js
// eslint.config.js
{
  files: ["apps/web/src/**/*.{ts,tsx}"],
  ignores: ["apps/web/src/adapters/**"],
  rules: {
    "no-restricted-imports": ["error", { paths: [{
      name: "react",
      importNames: ["useEffect", "useLayoutEffect", "useInsertionEffect"],
      message: "Use a loader or an event handler. An external subscription belongs in a hook under src/adapters/.",
    }] }],
    "no-restricted-properties": ["error",
      { object: "React", property: "useEffect", message: "See no-restricted-imports." },
      { object: "React", property: "useLayoutEffect", message: "See no-restricted-imports." },
    ],
  },
}
```

An import under another name (`import { useEffect as run }`) is still caught, since the rule looks at the imported name.

## No comments in code

No stock rule bans every comment. A short script over the parser does:

```js
// tools/no-comments.mjs: node tools/no-comments.mjs $(git ls-files '*.ts' '*.tsx')
import { readFileSync } from "node:fs";
import { parse } from "@typescript-eslint/typescript-estree";

for (const file of process.argv.slice(2)) {
  const { comments } = parse(readFileSync(file, "utf8"), { jsx: /x$/.test(file), comment: true, loc: true });
  for (const comment of comments ?? []) {
    console.error(`${file}:${comment.loc.start.line} no-comments: say it with a name, a type or a test`);
    process.exitCode = 1;
  }
}
```

Decide with the owner what stays allowed and encode it in the script: licence headers of vendored files, and whether a line that switches a lint rule off counts (banning it closes the escape hatch from every other rule here).

## Module boundaries

```js
// .dependency-cruiser.cjs
module.exports = { forbidden: [{
  name: "public-module-entry",
  comment: "Reach a module through its index, never its internals.",
  severity: "error",
  from: { pathNot: "^apps/server/src/modules/([^/]+)/" },
  to: { path: "^apps/server/src/modules/[^/]+/", pathNot: "^apps/server/src/modules/[^/]+/index\\.ts$" },
}] };
```

Adjust the paths to the project's layout and add one rule per boundary the owner names: a module's internals, server code imported by the client, a layer that must not know the one above it.

## Wiring

```json
{ "scripts": {
  "lint": "eslint . && node tools/no-comments.mjs $(git ls-files '*.ts' '*.tsx') && depcruise apps packages",
  "check": "pnpm types && pnpm lint && pnpm test"
} }
```

The settings name `check` once as the delivery check, and CI runs the same command.
