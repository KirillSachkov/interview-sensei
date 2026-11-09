import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/features/question-bank/infrastructure/schema.ts",
  out: "./src/features/question-bank/infrastructure/migrations",
});
