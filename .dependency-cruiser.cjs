const modules = "^apps/server/src/modules/";
module.exports = {
  forbidden: [
    { name: "no-cycles", from: {}, to: { circular: true } },
    { name: "resolved-import", from: {}, to: { couldNotResolve: true } },
    {
      name: "web-boundary",
      from: { path: "^apps/web" },
      to: { path: "^apps/server" },
    },
    {
      name: "contracts-standalone",
      from: { path: "^packages/contracts" },
      to: { path: "^apps/" },
    },
    {
      name: "domain-isolation",
      from: { path: modules + "([^/]+)/" },
      to: {
        path: "^(apps/|packages/|node_modules/)",
        pathNot: modules + "$1/",
      },
    },
    {
      name: "public-module-entry",
      from: { pathNot: modules },
      to: { path: modules, pathNot: modules + "[^/]+/index\\.ts$" },
    },
  ].map((rule) => ({ ...rule, severity: "error" })),
  options: {
    exclude: { path: "/dist/" },
    tsConfig: { fileName: "tsconfig.json" },
    tsPreCompilationDeps: true,
    doNotFollow: { path: "node_modules" },
    enhancedResolveOptions: {
      conditionNames: ["import", "node", "default"],
      exportsFields: ["exports"],
    },
  },
};
