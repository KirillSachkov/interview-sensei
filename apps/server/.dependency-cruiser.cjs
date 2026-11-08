// Dependency checks of the server, run by `pnpm boundaries`. The server composes the core
// features and serves HTTP; it reaches core only through the subpaths in core's package.json
// "exports". not-to-unresolvable rejects a package subpath outside "exports", and
// server-uses-core-exports rejects any other path into core's sources.
const base = require("../../config/dependency-cruiser/base.cjs");

module.exports = {
  extends: "../../config/dependency-cruiser/base.cjs",
  forbidden: [
    {
      name: "server-uses-core-exports",
      severity: "error",
      comment:
        "The server imports core only by package name: @interview-sensei/core/<subpath> from core's " +
        'package.json "exports". Import that subpath instead of a path into packages/core/src.',
      from: { path: "^src/" },
      to: { path: "(^|/)packages/core/src/" },
    },
  ],
  options: {
    ...base.options,
    // Imports by package name then resolve to node_modules/@interview-sensei/core instead of the
    // symlink target, so only a path into packages/core/src matches server-uses-core-exports.
    preserveSymlinks: true,
  },
};
