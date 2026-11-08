// Dependency checks of the server, run by `pnpm boundaries`. The server composes the core
// features and serves HTTP; it reaches core only through the subpaths in core's package.json
// "exports", which the not-to-unresolvable rule enforces.
module.exports = {
  extends: "../../config/dependency-cruiser/base.cjs",
  forbidden: [],
};
