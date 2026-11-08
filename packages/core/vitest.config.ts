import { defineConfig } from "vitest/config";

// Unit tests sit next to the code as `*.test.ts`: pure functions of the feature slices, no I/O.
export default defineConfig({
  test: {
    // Several agents run tests on one machine at the same time.
    maxWorkers: 4,
    projects: [{ extends: true, test: { name: "unit", include: ["src/**/*.test.ts"] } }],
  },
});
