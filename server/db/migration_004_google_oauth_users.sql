-- Google Sign-In: nullable password for OAuth-only users; optional google_sub for lookup/linking.
ALTER TABLE users
  ALTER COLUMN password_hash DROP NOT NULL;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS google_sub VARCHAR(255);

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_google_sub
  ON users (google_sub)
  WHERE google_sub IS NOT NULL;
