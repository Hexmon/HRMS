ALTER TABLE platform.company_profiles
  ADD COLUMN IF NOT EXISTS logo_document_id uuid NULL,
  ADD COLUMN IF NOT EXISTS logo_url text NULL,
  ADD COLUMN IF NOT EXISTS logo_file_name text NULL,
  ADD COLUMN IF NOT EXISTS logo_mime_type text NULL,
  ADD COLUMN IF NOT EXISTS logo_size_bytes integer NULL;

CREATE INDEX IF NOT EXISTS platform_company_profiles_logo_document_idx
  ON platform.company_profiles (logo_document_id)
  WHERE logo_document_id IS NOT NULL;
