-- A user's corrections to the working calendar payday is counted on: an
-- extra day off, or a holiday (or weekend day) that is a working day for them.

CREATE TABLE work_calendar_overrides (
  id INTEGER PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  date TEXT NOT NULL
    CHECK (date GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]' AND substr(date, 1, 4) BETWEEN '2024' AND '2099'),
  kind TEXT NOT NULL CHECK (kind IN ('off', 'working')),
  note TEXT CHECK (length(note) BETWEEN 1 AND 64),
  created_at TEXT NOT NULL CHECK (created_at GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T*Z')
) STRICT;

CREATE UNIQUE INDEX work_calendar_overrides_user_date ON work_calendar_overrides (user_id, date);
