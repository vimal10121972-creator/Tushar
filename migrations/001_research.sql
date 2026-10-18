CREATE SCHEMA IF NOT EXISTS research;
CREATE TABLE IF NOT EXISTS research.members (
 user_id text PRIMARY KEY, email text NOT NULL UNIQUE, name text NOT NULL,
 role text NOT NULL CHECK(role IN ('OWNER','MEMBER')), active boolean NOT NULL DEFAULT true,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS research.invites (
 email text PRIMARY KEY, invited_by text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL DEFAULT now()+interval '14 days'
);
CREATE TABLE IF NOT EXISTS research.reports (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id text NOT NULL REFERENCES research.members(user_id),
 company jsonb NOT NULL, company_key text NOT NULL, idempotency_key text NOT NULL,
 status text NOT NULL DEFAULT 'QUEUED' CHECK(status IN ('QUEUED','PROCESSING','READY','LIMITED','BLOCKED','FAILED')),
 stage integer NOT NULL DEFAULT 0, stage_name text NOT NULL DEFAULT 'Queued',
 payload jsonb NOT NULL DEFAULT '{}'::jsonb, result jsonb, assumptions jsonb NOT NULL DEFAULT '{}'::jsonb,
 error text, attempts integer NOT NULL DEFAULT 0, next_attempt_at timestamptz NOT NULL DEFAULT now(),
 lease_token uuid, lease_until timestamptz, pdf_base64 text, pdf_pages integer,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(user_id,idempotency_key)
);
CREATE INDEX IF NOT EXISTS reports_queue ON research.reports(status,next_attempt_at,lease_until);
CREATE INDEX IF NOT EXISTS reports_user ON research.reports(user_id,created_at DESC);
CREATE TABLE IF NOT EXISTS research.stage_events (
 id bigserial PRIMARY KEY, report_id uuid NOT NULL REFERENCES research.reports(id), stage integer NOT NULL,
 stage_name text NOT NULL, status text NOT NULL, detail text, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS research.shares (
 report_id uuid NOT NULL REFERENCES research.reports(id), email text NOT NULL, shared_by text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(report_id,email)
);
CREATE TABLE IF NOT EXISTS research.schedules (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id text NOT NULL REFERENCES research.members(user_id),
 company jsonb NOT NULL, frequency text NOT NULL CHECK(frequency IN ('MONTHLY','QUARTERLY')),
 enabled boolean NOT NULL DEFAULT true, next_run_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(user_id,company,frequency)
);
CREATE TABLE IF NOT EXISTS research.rate_limits (
 key text PRIMARY KEY, count integer NOT NULL DEFAULT 1, expires_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS research.provider_health (
 provider text PRIMARY KEY, status text NOT NULL, detail text, checked_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS research.source_cache (
 key text PRIMARY KEY, value jsonb NOT NULL, expires_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS research.settings (
 key text PRIMARY KEY, value jsonb NOT NULL
);
INSERT INTO research.settings(key,value) VALUES ('active_host','"disabled"'::jsonb) ON CONFLICT DO NOTHING;
