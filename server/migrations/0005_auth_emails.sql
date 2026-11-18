-- When an account was last sent an email that anyone can request for its
-- address, for the per-address limits. Each kind has its own limit, so one
-- kind of request cannot use up another's share. Rows older than a day are
-- removed as new ones are counted.

CREATE TABLE auth_emails (
  id INTEGER PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('verification', 'reset', 'notice')),
  sent_at TEXT NOT NULL CHECK (sent_at GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T*Z')
) STRICT;

CREATE INDEX auth_emails_user_kind_sent ON auth_emails (user_id, kind, sent_at);
