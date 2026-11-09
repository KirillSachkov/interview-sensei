// Dependency checks of the server, run by `pnpm boundaries`. The server composes the core
// features and serves HTTP; it reaches core only through the subpaths in core's package.json
// "exports". not-to-unresolvable rejects a package subpath outside "exports", and
// server-uses-core-exports rejects any other path into core's sources.
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
    {
      name: "server-composes-features-in-one-module",
      severity: "error",
      comment:
        "Only src/composition.ts and its parts src/composition-<part>.ts import core features " +
        "(@interview-sensei/core/<feature>): it calls each feature's module factory once and hands " +
        "the routes finished services. Take a service " +
        "or type from ./composition.ts instead; shared subpaths such as time and session-kinds stay " +
        "open to every file.",
      from: {
        path: "^src/",
        pathNot: [String.raw`^src/composition\.ts$`, String.raw`^src/composition-[a-z]+\.ts$`],
      },
      to: { path: "(^|/)node_modules/@interview-sensei/core/src/features/" },
    },
  ],
  // extends merges these options into the base options.
  options: {
    // Imports by package name then resolve to node_modules/@interview-sensei/core instead of the
    // symlink target, so only a path into packages/core/src matches server-uses-core-exports.
    preserveSymlinks: true,
  },
};
