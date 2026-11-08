// Architecture boundaries of the core package, checked by `pnpm boundaries`.
// Feature slices live in src/features/<feature>/ with the layers domain/, application/ and
// infrastructure/. src/shared/ holds technical code that any slice may use.
module.exports = {
  extends: "../../config/dependency-cruiser/base.cjs",
  forbidden: [
    {
      name: "domain-is-pure",
      severity: "error",
      comment:
        "domain/ holds entities, value objects and rules in plain TypeScript and imports only the " +
        "domain/ of its own feature. Keep application code, infrastructure, shared technical code, " +
        "Node.js built-ins and npm packages out: define a port (interface) in domain/ and implement " +
        "it in infrastructure/; application/ wires them together.",
      from: { path: "^src/features/([^/]+)/domain/" },
      to: { pathNot: "^src/features/$1/domain/" },
    },
    {
      name: "application-does-not-use-infrastructure",
      severity: "error",
      comment:
        "application/ depends on domain/ ports, not on their implementations. Take the " +
        "infrastructure implementation as a parameter; the server composes them.",
      from: { path: "^src/features/([^/]+)/application/" },
      to: { path: "^src/features/$1/infrastructure/" },
    },
    {
      name: "features-are-independent",
      severity: "error",
      comment:
        "Feature slices must not import each other, so parallel work on slices does not conflict. " +
        "Move technical code both slices need into src/shared/; a shared domain concept needs an " +
        "owner decision (ADR).",
      from: { path: "^src/features/([^/]+)/" },
      to: { path: "^src/features/", pathNot: "^src/features/$1/" },
    },
    {
      name: "shared-is-technical",
      severity: "error",
      comment:
        "src/shared/ holds technical code only (time, later database and similar) and must not " +
        "depend on feature slices. Domain code belongs in its feature.",
      from: { path: "^src/shared/" },
      to: { path: "^src/features/" },
    },
  ],
};
