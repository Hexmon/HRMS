CREATE TABLE IF NOT EXISTS platform.company_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name text NOT NULL,
  company_slug text NOT NULL UNIQUE,
  timezone text NOT NULL DEFAULT 'Asia/Kolkata',
  locale text NOT NULL DEFAULT 'en-IN',
  fiscal_year_start_month integer NOT NULL DEFAULT 4 CHECK (fiscal_year_start_month BETWEEN 1 AND 12),
  status text NOT NULL DEFAULT 'pending',
  bootstrap_completed_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS platform_company_profiles_status_idx ON platform.company_profiles (status, updated_at DESC);

CREATE TABLE IF NOT EXISTS platform.auth_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash text NOT NULL UNIQUE,
  token_type text NOT NULL,
  user_id uuid NULL,
  email text NULL,
  company_id uuid NULL,
  status text NOT NULL DEFAULT 'active',
  expires_at timestamptz NOT NULL,
  used_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS platform_auth_tokens_lookup_idx ON platform.auth_tokens (token_hash, token_type, status, expires_at);
CREATE INDEX IF NOT EXISTS platform_auth_tokens_user_type_idx ON platform.auth_tokens (user_id, token_type, status, created_at DESC);
CREATE INDEX IF NOT EXISTS platform_auth_tokens_email_type_idx ON platform.auth_tokens (lower(email), token_type, status, created_at DESC);
CREATE INDEX IF NOT EXISTS platform_auth_tokens_metadata_gin_idx ON platform.auth_tokens USING gin (metadata);

CREATE TABLE IF NOT EXISTS platform.user_session_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  active_role text NOT NULL,
  company_id uuid NULL,
  landing_page text NOT NULL DEFAULT '/dashboard',
  locale text NOT NULL DEFAULT 'en-IN',
  timezone text NOT NULL DEFAULT 'Asia/Kolkata',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS platform_user_session_preferences_role_idx ON platform.user_session_preferences (user_id, active_role);
