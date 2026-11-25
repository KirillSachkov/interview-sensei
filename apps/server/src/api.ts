import { resolve } from "node:path";
import files from "@fastify/static";
import { Pool } from "pg";
import { apiConfig } from "./config.js";
import { makeApi } from "./adapters/http.js";
import { goalSetupStore, migrate, workspaceStore } from "./adapters/storage.js";
import { goalSetups } from "./modules/goals-and-scenarios/index.js";
import {
  goalSetupAgent,
  ollamaGoalSetupModel,
} from "./modules/agent-execution/index.js";
const config = apiConfig();
await migrate(config.DATABASE_URL);
const pool = new Pool({ connectionString: config.DATABASE_URL });
const model = config.OLLAMA_BASE_URL
  ? ollamaGoalSetupModel(config.OLLAMA_BASE_URL, config.OLLAMA_MODEL)
  : undefined;
const api = await makeApi(
  config.PUBLIC_ORIGIN,
  workspaceStore(pool),
  goalSetups(goalSetupStore(pool)),
  goalSetupAgent(model),
);
await api.register(files, { root: resolve("apps/web/dist") });
api.addHook("onClose", () => pool.end());
process.once("SIGTERM", () => {
  void api.close();
});
await api.listen({ host: "0.0.0.0", port: config.PORT });
