-- Families: the people who share food budgets, and the codes that invite
-- someone in.

CREATE TABLE families (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 128),
  -- Who made it; null once that account is deleted. The family outlives it.
  created_by TEXT REFERENCES users (id) ON DELETE SET NULL,
  created_at TEXT NOT NULL CHECK (created_at GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T*Z')
) STRICT;

CREATE TABLE family_members (
  id INTEGER PRIMARY KEY,
  family_id TEXT NOT NULL REFERENCES families (id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner', 'member')),
  joined_at TEXT NOT NULL CHECK (joined_at GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T*Z')
) STRICT;

-- One family per user.
CREATE UNIQUE INDEX family_members_user ON family_members (user_id);
CREATE INDEX family_members_family ON family_members (family_id, joined_at);
-- At most one owner. That a family with members has one is kept by the
-- service, in the transaction that changes the members.
CREATE UNIQUE INDEX family_members_owner ON family_members (family_id) WHERE role = 'owner';

-- A code read aloud or typed from a phone, used once. Only its SHA-256 is
-- kept, like the email links: the code is shown once, when it is made.
CREATE TABLE family_invites (
  id INTEGER PRIMARY KEY,
  family_id TEXT NOT NULL REFERENCES families (id) ON DELETE CASCADE,
  code_hash TEXT NOT NULL UNIQUE CHECK (length(code_hash) = 64),
  created_by TEXT REFERENCES users (id) ON DELETE SET NULL,
  expires_at TEXT NOT NULL CHECK (expires_at GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T*Z'),
  used_at TEXT CHECK (used_at GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T*Z'),
  used_by TEXT REFERENCES users (id) ON DELETE SET NULL,
  created_at TEXT NOT NULL CHECK (created_at GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T*Z')
) STRICT;

CREATE INDEX family_invites_family ON family_invites (family_id);
