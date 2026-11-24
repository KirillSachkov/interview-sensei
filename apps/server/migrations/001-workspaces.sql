-- Up Migration
CREATE TABLE workspaces (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
CREATE TABLE guest_sessions (
  secret_hash text PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL
);
