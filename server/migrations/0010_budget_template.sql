-- The template: the categories and entries a new month can start from, kept
-- as a row in months with no month key, so its categories and entries use
-- the same tables and foreign keys as a month's. SQLite cannot make a column
-- nullable in place, so months is built again (the runner has foreign keys
-- off, and checks them before committing).

CREATE TABLE months_new (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  -- YYYY-MM; null only on the template.
  month_key TEXT
    CHECK (month_key GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]' AND substr(month_key, 6, 2) BETWEEN '01' AND '12'),
  is_template INTEGER NOT NULL DEFAULT 0 CHECK (is_template IN (0, 1)),
  created_at TEXT NOT NULL CHECK (created_at GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T*Z'),
  UNIQUE (user_id, month_key),
  CHECK ((is_template = 1) = (month_key IS NULL))
) STRICT;

INSERT INTO months_new (id, user_id, month_key, created_at)
SELECT id, user_id, month_key, created_at FROM months;

DROP TABLE months;
ALTER TABLE months_new RENAME TO months;

CREATE UNIQUE INDEX months_id_user ON months (id, user_id);
-- At most one template per user.
CREATE UNIQUE INDEX months_user_template ON months (user_id) WHERE is_template = 1;
