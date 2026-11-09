import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/features/app-settings/infrastructure/schema.ts",
  out: "./src/features/app-settings/infrastructure/migrations",
});
