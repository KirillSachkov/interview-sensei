import { afterEach, expect, it, vi } from "vitest";
import { apiConfig, workerConfig } from "../apps/server/src/config.js";
afterEach(() => vi.unstubAllEnvs());
it("names missing settings without exposing their contents", () => {
  vi.stubEnv("DATABASE_URL", undefined);
  expect(workerConfig).toThrow("DATABASE_URL");
  vi.stubEnv("DATABASE_URL", "postgres://localhost/test");
  vi.stubEnv("PUBLIC_ORIGIN", "sensitive-invalid-setting");
  expect(apiConfig).toThrow("PUBLIC_ORIGIN");
  expect(apiConfig).not.toThrow("sensitive-invalid-setting");
});
