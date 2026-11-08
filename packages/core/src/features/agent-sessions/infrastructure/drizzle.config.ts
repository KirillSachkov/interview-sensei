import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/features/agent-sessions/infrastructure/schema.ts",
  out: "./src/features/agent-sessions/infrastructure/migrations",
});
