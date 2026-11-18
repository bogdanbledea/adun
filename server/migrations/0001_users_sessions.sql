-- Accounts and sign-in sessions.

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  -- Stored lower-cased; unique regardless of case.
  email TEXT NOT NULL CHECK (length(email) BETWEEN 3 AND 320),
  display_name TEXT NOT NULL CHECK (length(display_name) BETWEEN 1 AND 256),
  password_hash TEXT NOT NULL,
  privacy_accepted_at TEXT NOT NULL CHECK (privacy_accepted_at GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T*Z'),
  privacy_policy_version TEXT NOT NULL CHECK (length(privacy_policy_version) BETWEEN 1 AND 16),
  created_at TEXT NOT NULL CHECK (created_at GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T*Z')
) STRICT;

CREATE UNIQUE INDEX users_email_lower ON users (lower(email));

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  -- SHA-256 (hex) of the cookie value; the value itself is never stored.
  token_hash TEXT NOT NULL UNIQUE CHECK (length(token_hash) = 64),
  expires_at TEXT NOT NULL CHECK (expires_at GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T*Z'),
  last_used_at TEXT NOT NULL CHECK (last_used_at GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T*Z'),
  revoked_at TEXT CHECK (revoked_at GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T*Z'),
  created_at TEXT NOT NULL CHECK (created_at GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T*Z')
) STRICT;

CREATE INDEX sessions_user ON sessions (user_id);
