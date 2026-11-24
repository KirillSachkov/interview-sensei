import { resolve } from "node:path";
import files from "@fastify/static";
import { Pool } from "pg";
import { apiConfig } from "./config.js";
import { makeApi } from "./adapters/http.js";
import { migrate, workspaceStore } from "./adapters/storage.js";
const config = apiConfig();
await migrate(config.DATABASE_URL);
const pool = new Pool({ connectionString: config.DATABASE_URL });
const api = await makeApi(config.PUBLIC_ORIGIN, workspaceStore(pool));
await api.register(files, { root: resolve("apps/web/dist") });
api.addHook("onClose", () => pool.end());
process.once("SIGTERM", () => {
  void api.close();
});
await api.listen({ host: "0.0.0.0", port: config.PORT });
