// TypeScript 7 ships no classic JavaScript compiler API (`require("typescript")` returns only the version).
// Tools that parse code through that API get it from @typescript/typescript6 as a private
// dependency, while the workspaces type-check with TypeScript 7.
const typescript6 = "npm:@typescript/typescript6@6.0.2";
const needsTypeScript6Api = new Set([
  // Parses TypeScript sources; without a compatible compiler it silently misses dependencies.
  "dependency-cruiser",
]);

function readPackage(manifest) {
  if (needsTypeScript6Api.has(manifest.name)) {
    delete manifest.peerDependencies?.typescript;
    delete manifest.peerDependenciesMeta?.typescript;
    manifest.dependencies = { ...manifest.dependencies, typescript: typescript6 };
  }
  return manifest;
}

module.exports = { hooks: { readPackage } };
