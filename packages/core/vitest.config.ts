import { defineConfig } from "vitest/config";

// Unit tests sit next to the code as `*.test.ts`: pure functions of the feature slices, no I/O.
// Integration tests are `*.int.test.ts`: they run technical code on real infrastructure, such as
// PGlite, files and the fake ACP agent as a process, in temporary directories. Live tests are
// `*.live.test.ts`: they download and run real components, only in `test:live`.
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
          exclude: ["src/**/*.int.test.ts", "src/**/*.live.test.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "integration",
          include: ["src/**/*.int.test.ts"],
          // Each test starts PGlite or an agent process, which takes about a second and longer under
          // parallel load.
          testTimeout: 30_000,
        },
      },
      {
        extends: true,
        test: {
          // Seam 3 of spec #74: the real components of speech recognition. They download about
          // 950 MB, so only `test:live` and its CI job run them.
          name: "live",
          include: ["src/**/*.live.test.ts"],
          testTimeout: 1_200_000,
        },
      },
    ],
  },
});
