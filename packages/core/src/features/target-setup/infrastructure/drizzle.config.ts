import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/features/target-setup/infrastructure/schema.ts",
  out: "./src/features/target-setup/infrastructure/migrations",
});
