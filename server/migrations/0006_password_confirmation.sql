-- When the password was last typed again on a session, for the actions that
-- ask for it once more (deleting the account). Cleared when used.

ALTER TABLE sessions ADD COLUMN password_confirmed_at TEXT
  CHECK (password_confirmed_at GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T*Z');
