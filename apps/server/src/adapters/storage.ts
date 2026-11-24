import { sessionLifetimeSeconds } from "./session.js";
import { createHash } from "node:crypto";
import { runner } from "node-pg-migrate";
import type { Pool } from "pg";
import { z } from "zod";
export interface WorkspaceStore {
  find(secret: string): Promise<string | undefined>;
  create(secret: string): Promise<string>;
}

const hash = (secret: string) =>
  createHash("sha256").update(secret).digest("hex");
const row = z.object({ id: z.uuid() });
export function migrate(databaseUrl: string) {
  return runner({
    databaseUrl,
    dir: "apps/server/migrations",
    direction: "up",
    migrationsTable: "schema_migrations",
  });
}
export function workspaceStore(pool: Pool): WorkspaceStore {
  return {
    async find(secret) {
      const result = await pool.query(
        "SELECT workspace_id AS id FROM guest_sessions WHERE secret_hash=$1 AND expires_at > now()",
        [hash(secret)],
      );
      return row.optional().parse(result.rows[0])?.id;
    },
    async create(secret) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const result = await client.query(
          "INSERT INTO workspaces DEFAULT VALUES RETURNING id",
        );
        const { id } = row.parse(result.rows[0]);
        await client.query(
          "INSERT INTO guest_sessions (secret_hash, workspace_id, expires_at) VALUES ($1,$2,now() + $3 * interval '1 second')",
          [hash(secret), id, sessionLifetimeSeconds],
        );
        await client.query("COMMIT");
        return id;
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },
  };
}
