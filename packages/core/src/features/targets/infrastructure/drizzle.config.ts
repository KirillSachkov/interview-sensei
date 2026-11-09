import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/features/targets/infrastructure/schema.ts",
  out: "./src/features/targets/infrastructure/migrations",
});
