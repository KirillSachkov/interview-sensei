const modules = "^apps/server/src/modules/";
const agent = modules + "agent-execution/";
const goals = modules + "goals-and-scenarios/index\\.ts$";
const agentPackages = "(?:zod|@langchain/(?:core|langgraph|ollama))/";
module.exports = {
  forbidden: [
    { name: "no-cycles", from: {}, to: { circular: true } },
    { name: "resolved-import", from: {}, to: { couldNotResolve: true } },
    {
      name: "web-boundary",
      from: { path: "^apps/web" },
      to: { path: "^apps/server", reachable: true },
    },
    {
      name: "contracts-standalone",
      from: { path: "^packages/contracts" },
      to: { path: "^apps/" },
    },
    {
      name: "domain-isolation",
      from: { path: modules + "([^/]+)/", pathNot: agent },
      to: {
        path: "^(apps/|packages/|node_modules/)",
        pathNot: modules + "$1/",
      },
    },
    {
      name: "agent-execution-isolation",
      from: { path: agent },
      to: {
        path: "^(apps/|packages/|node_modules/)",
        pathNot: [
          agent,
          goals,
          "^node_modules/" + agentPackages,
          "^node_modules/\\.pnpm/[^/]+/node_modules/" + agentPackages,
        ],
      },
    },
    {
      name: "goal-setup-type-only",
      from: { path: agent },
      to: { path: goals, dependencyTypesNot: ["type-only"] },
    },
    {
      name: "public-module-entry",
      from: { pathNot: modules },
      to: { path: modules, pathNot: modules + "[^/]+/index\\.ts$" },
    },
  ].map((rule) => ({ ...rule, severity: "error" })),
  options: {
    exclude: { path: "^apps/[^/]+/dist/" },
    tsConfig: { fileName: "tsconfig.json" },
    tsPreCompilationDeps: true,
    doNotFollow: { path: "node_modules" },
    enhancedResolveOptions: {
      conditionNames: ["import", "node", "default"],
      exportsFields: ["exports"],
    },
  },
};
