ALTER TABLE core.users
  ADD COLUMN IF NOT EXISTS profile_photo_document_id uuid NULL,
  ADD COLUMN IF NOT EXISTS profile_photo_url text NULL;

CREATE INDEX IF NOT EXISTS core_users_profile_photo_document_idx
  ON core.users (profile_photo_document_id)
  WHERE profile_photo_document_id IS NOT NULL AND deleted_at IS NULL;
