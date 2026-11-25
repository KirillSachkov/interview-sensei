import { sessionLifetimeSeconds } from "./session.js";
import { createHash } from "node:crypto";
import { runner } from "node-pg-migrate";
import type { Pool } from "pg";
import { z } from "zod";
import type { StoredGoalSetupTurn } from "../modules/goals-and-scenarios/index.js";
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

const storedGoalSetupResult = z.object({
  turnId: z.uuid(),
  message: z.string(),
  reply: z.string(),
  path: z.array(z.string()),
  draft: z.object({
    revision: z.int().nonnegative(),
    details: z.object({
      role: z.string().nullable(),
      level: z.string().nullable(),
      market: z.string().nullable(),
    }),
    current: z
      .discriminatedUnion("kind", [
        z.object({ kind: z.literal("question"), text: z.string() }),
        z.object({
          kind: z.literal("proposal"),
          text: z.string(),
          version: z.int().positive(),
          turnId: z.uuid().optional(),
        }),
      ])
      .nullable(),
  }),
});

const goalSetupRow = z
  .object({
    result: storedGoalSetupResult,
    last_proposal_version: z.int().nonnegative(),
  })
  .transform(({ result, last_proposal_version }) => ({
    result,
    lastProposalVersion: last_proposal_version,
  }));

export function goalSetupStore(pool: Pool) {
  return {
    async history(workspaceId: string) {
      const result = await pool.query(
        "SELECT result, last_proposal_version FROM goal_setup_turns WHERE workspace_id=$1 ORDER BY revision",
        [workspaceId],
      );
      return goalSetupRow.array().parse(result.rows);
    },
    async find(workspaceId: string, turnId: string) {
      const result = await pool.query(
        "SELECT result, last_proposal_version FROM goal_setup_turns WHERE workspace_id=$1 AND turn_id=$2",
        [workspaceId, turnId],
      );
      return goalSetupRow.optional().parse(result.rows[0]);
    },
    async append(
      workspaceId: string,
      { result, lastProposalVersion }: StoredGoalSetupTurn,
    ) {
      const saved = await pool.query(
        `INSERT INTO goal_setup_turns (workspace_id, turn_id, revision, last_proposal_version, result)
         SELECT $1, $2, $3, $4, $5
         WHERE (SELECT COALESCE(MAX(revision), 0) FROM goal_setup_turns WHERE workspace_id=$1) = $3 - 1
         ON CONFLICT DO NOTHING`,
        [
          workspaceId,
          result.turnId,
          result.draft.revision,
          lastProposalVersion,
          storedGoalSetupResult.parse(result),
        ],
      );
      return saved.rowCount === 1;
    },
  };
}
