import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/features/interviews/infrastructure/schema.ts",
  out: "./src/features/interviews/infrastructure/migrations",
});
