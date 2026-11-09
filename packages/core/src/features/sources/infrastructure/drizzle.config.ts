import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/features/sources/infrastructure/schema.ts",
  out: "./src/features/sources/infrastructure/migrations",
});
