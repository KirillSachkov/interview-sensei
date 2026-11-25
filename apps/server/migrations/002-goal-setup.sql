-- Up Migration
CREATE TABLE goal_setup_turns (
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  turn_id uuid NOT NULL,
  revision integer NOT NULL CHECK (revision > 0),
  last_proposal_version integer NOT NULL CHECK (last_proposal_version >= 0),
  result jsonb NOT NULL,
  PRIMARY KEY (workspace_id, turn_id),
  UNIQUE (workspace_id, revision)
);
