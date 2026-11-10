import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/features/answer-search/infrastructure/schema.ts",
  out: "./src/features/answer-search/infrastructure/migrations",
});
