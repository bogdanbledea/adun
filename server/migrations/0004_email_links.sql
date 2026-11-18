-- Links sent by email: confirming an address and resetting a password.

ALTER TABLE users ADD COLUMN email_verified_at TEXT
  CHECK (email_verified_at GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T*Z');

-- Accounts made before addresses were confirmed keep working.
UPDATE users SET email_verified_at = created_at;

CREATE TABLE auth_tokens (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  purpose TEXT NOT NULL CHECK (purpose IN ('email_verification', 'password_reset')),
  -- SHA-256 (hex) of the token in the link; the token itself is never stored.
  token_hash TEXT NOT NULL UNIQUE CHECK (length(token_hash) = 64),
  -- SHA-256 (hex) of the cookie of the browser that asked for the link, if any.
  browser_hash TEXT CHECK (length(browser_hash) = 64),
  expires_at TEXT NOT NULL CHECK (expires_at GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T*Z'),
  consumed_at TEXT CHECK (consumed_at GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T*Z'),
  created_at TEXT NOT NULL CHECK (created_at GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T*Z')
) STRICT;

CREATE INDEX auth_tokens_user_purpose ON auth_tokens (user_id, purpose);
