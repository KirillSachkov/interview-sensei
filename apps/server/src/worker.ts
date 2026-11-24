import { Client } from "pg";
import { workerConfig } from "./config.js";
const config = workerConfig();
const connection = new Client({ connectionString: config.DATABASE_URL });
await connection.connect();
await connection.query("SELECT 1");
console.info("Worker ready");
process.once("SIGTERM", () => {
  void connection.end();
});
