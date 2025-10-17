-- Workflows core tables

CREATE TABLE IF NOT EXISTS workflows (
  id text PRIMARY KEY,
  owner varchar(160) NOT NULL,
  name varchar(200) NOT NULL,
  description text,
  definition_version integer NOT NULL DEFAULT 1,
  definition jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS workflows_owner_idx ON workflows(owner);
CREATE INDEX IF NOT EXISTS workflows_updated_at_idx ON workflows(updated_at);

CREATE TYPE workflow_status AS ENUM ('queued','running','completed','failed','cancelled');

CREATE TABLE IF NOT EXISTS workflow_runs (
  id text PRIMARY KEY,
  workflow_id text NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  owner varchar(160) NOT NULL,
  status workflow_status NOT NULL DEFAULT 'queued',
  input jsonb,
  output jsonb,
  error jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  ended_at timestamptz
);

CREATE INDEX IF NOT EXISTS workflow_runs_wf_idx ON workflow_runs(workflow_id);
CREATE INDEX IF NOT EXISTS workflow_runs_owner_idx ON workflow_runs(owner);
CREATE INDEX IF NOT EXISTS workflow_runs_status_idx ON workflow_runs(status);

CREATE TYPE step_status AS ENUM ('queued','running','completed','failed','skipped');

CREATE TABLE IF NOT EXISTS workflow_run_steps (
  id text PRIMARY KEY,
  run_id text NOT NULL REFERENCES workflow_runs(id) ON DELETE CASCADE,
  step_id text NOT NULL,
  name varchar(200) NOT NULL,
  type varchar(30) NOT NULL,
  status step_status NOT NULL DEFAULT 'queued',
  attempt integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 1,
  input jsonb,
  output jsonb,
  error jsonb,
  deps text[],
  logs text,
  started_at timestamptz,
  ended_at timestamptz
);

CREATE INDEX IF NOT EXISTS workflow_run_steps_run_idx ON workflow_run_steps(run_id);
CREATE INDEX IF NOT EXISTS workflow_run_steps_step_idx ON workflow_run_steps(step_id);





