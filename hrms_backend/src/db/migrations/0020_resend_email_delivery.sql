ALTER TABLE core.users
  ADD COLUMN IF NOT EXISTS email_verified_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS email_verification_status text NOT NULL DEFAULT 'unverified';

DO $$
BEGIN
  ALTER TABLE core.users
    ADD CONSTRAINT core_users_email_verification_status_chk
    CHECK (email_verification_status IN ('unverified', 'pending', 'verified', 'bounced', 'blocked'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

UPDATE core.users
SET
  email_verified_at = COALESCE(email_verified_at, now()),
  email_verification_status = 'verified'
WHERE employment_status = 'active'
  AND deleted_at IS NULL
  AND email_verification_status <> 'verified';

UPDATE core.users u
SET email_verification_status = 'pending'
WHERE u.employment_status <> 'active'
  AND u.email_verification_status = 'unverified'
  AND EXISTS (
    SELECT 1
    FROM platform.auth_tokens t
    WHERE t.user_id = u.id
      AND t.token_type = 'email_verification'
      AND t.status = 'active'
  );

CREATE INDEX IF NOT EXISTS core_users_email_verification_status_idx
  ON core.users (email_verification_status, updated_at DESC);

ALTER TABLE platform.auth_tokens
  ADD COLUMN IF NOT EXISTS revoked_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS created_ip_hash text NULL,
  ADD COLUMN IF NOT EXISTS user_agent_hash text NULL,
  ADD COLUMN IF NOT EXISTS last_sent_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS send_count integer NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS platform_auth_tokens_type_status_expiry_idx
  ON platform.auth_tokens (token_type, status, expires_at);

CREATE INDEX IF NOT EXISTS platform_auth_tokens_email_type_created_idx
  ON platform.auth_tokens (lower(email), token_type, created_at DESC);

CREATE TABLE IF NOT EXISTS platform.email_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL DEFAULT 'resend',
  template_key text NOT NULL,
  purpose text NOT NULL,
  user_id uuid NULL,
  email text NOT NULL,
  subject text NOT NULL,
  status text NOT NULL DEFAULT 'queued',
  provider_email_id text NULL,
  idempotency_key text NOT NULL,
  error_code text NULL,
  error_message text NULL,
  queued_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz NULL,
  delivered_at timestamptz NULL,
  failed_at timestamptz NULL,
  bounced_at timestamptz NULL,
  complained_at timestamptz NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1
);

CREATE UNIQUE INDEX IF NOT EXISTS platform_email_deliveries_idempotency_uq
  ON platform.email_deliveries (provider, idempotency_key);

CREATE UNIQUE INDEX IF NOT EXISTS platform_email_deliveries_provider_email_id_uq
  ON platform.email_deliveries (provider, provider_email_id)
  WHERE provider_email_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS platform_email_deliveries_user_created_idx
  ON platform.email_deliveries (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS platform_email_deliveries_email_created_idx
  ON platform.email_deliveries (lower(email), created_at DESC);

CREATE INDEX IF NOT EXISTS platform_email_deliveries_status_queued_idx
  ON platform.email_deliveries (status, queued_at);

CREATE TABLE IF NOT EXISTS platform.email_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL DEFAULT 'resend',
  provider_event_id text NOT NULL,
  provider_email_id text NULL,
  event_type text NOT NULL,
  email text NULL,
  delivery_id uuid NULL,
  payload jsonb NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS platform_email_events_provider_event_uq
  ON platform.email_events (provider, provider_event_id);

CREATE INDEX IF NOT EXISTS platform_email_events_provider_email_idx
  ON platform.email_events (provider_email_id);

CREATE INDEX IF NOT EXISTS platform_email_events_type_received_idx
  ON platform.email_events (event_type, received_at DESC);
