import { defineConfig } from "vitest/config";

// Unit tests sit next to the code as `*.test.ts`. Integration tests are `*.int.test.ts`: they
// build the server in process and call its HTTP API, or run its entry point as a process.
// Package tests are `*.package.test.ts`: they install the built npm package. Only
// `pnpm test:package` runs them, because they need the build and npm downloads.
export default defineConfig({
  test: {
    // Several agents run tests on one machine at the same time.
    maxWorkers: 4,
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          include: ["src/**/*.test.ts"],
          exclude: ["src/**/*.int.test.ts", "src/**/*.package.test.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "integration",
          include: ["src/**/*.int.test.ts"],
          // Each test starts PGlite or the server process, which takes seconds under parallel load.
          testTimeout: 30_000,
        },
      },
      {
        extends: true,
        test: {
          name: "package",
          include: ["src/**/*.package.test.ts"],
          testTimeout: 60_000,
        },
      },
    ],
  },
});
