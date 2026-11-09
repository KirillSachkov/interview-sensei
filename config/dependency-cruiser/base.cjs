// Rules and options every workspace checked by dependency-cruiser shares. A workspace config
// extends this file and adds its own architecture rules. Each rule's comment is the message an
// agent sees on a violation: it says why and where code goes.
module.exports = {
  forbidden: [
    {
      name: "no-circular",
      severity: "error",
      comment: "Circular imports break initialization order. Extract the shared part or invert it.",
      from: {},
      to: { circular: true },
    },
    {
      name: "not-to-unresolvable",
      severity: "error",
      comment: "The import does not resolve. Fix the path or add the dependency to package.json.",
      from: {},
      to: { couldNotResolve: true },
    },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    // Type-only imports are dependencies too: a type from another layer is still a coupling.
    tsPreCompilationDeps: true,
    tsConfig: { fileName: "tsconfig.json" },
    enhancedResolveOptions: {
      exportsFields: ["exports"],
      conditionNames: ["import", "require", "node", "default", "types"],
      extensions: [".ts", ".js"],
    },
  },
};
