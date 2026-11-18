-- What the user changed, for the history in the settings. Written in the same
-- transaction as the change it describes; kept 365 days.

CREATE TABLE activity_logs (
  id INTEGER PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  action TEXT NOT NULL CHECK (length(action) BETWEEN 1 AND 64),
  created_at TEXT NOT NULL CHECK (created_at GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T*Z')
) STRICT;

CREATE INDEX activity_logs_user_created ON activity_logs (user_id, created_at);
CREATE INDEX activity_logs_created ON activity_logs (created_at);
