-- Reminders: due dates such as ITP or RCA, and the record of which email
-- checkpoints the hourly sweep has already handled.

CREATE TABLE reminders (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('itp', 'rca', 'casco', 'rovinieta', 'revizie_gaz', 'extinctor', 'altele')),
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 256),
  -- Which car, which apartment.
  subject TEXT CHECK (length(subject) BETWEEN 1 AND 128),
  due_date TEXT NOT NULL
    CHECK (due_date GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]' AND substr(due_date, 1, 4) BETWEEN '2000' AND '2100'),
  -- Null: does not repeat, so renewing needs a new date.
  interval_months INTEGER CHECK (interval_months BETWEEN 1 AND 120),
  -- Days before the due date to send an email: a JSON array of 1 to 5
  -- numbers from 0 to 365, sorted and unique (the service sees to that).
  lead_days TEXT NOT NULL DEFAULT '[3]'
    CHECK (json_valid(lead_days) AND json_type(lead_days) = 'array' AND json_array_length(lead_days) BETWEEN 1 AND 5),
  notes TEXT CHECK (length(notes) BETWEEN 1 AND 512),
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at TEXT NOT NULL CHECK (created_at GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T*Z')
) STRICT;

CREATE INDEX reminders_user ON reminders (user_id);
CREATE INDEX reminders_active_due ON reminders (is_active, due_date);
-- Target of the notifications' foreign key: a notification's user is its reminder's user.
CREATE UNIQUE INDEX reminders_id_user ON reminders (id, user_id);

-- One row per (reminder, due date, lead days) the sweep has dealt with. The
-- unique index is what makes a second email for the same checkpoint
-- impossible: the sweep claims a checkpoint by inserting, and only the insert
-- that succeeds may send. was_sent becomes 1 once the mail server took it.
CREATE TABLE reminder_notifications (
  id INTEGER PRIMARY KEY,
  reminder_id TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  due_date TEXT NOT NULL CHECK (due_date GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]'),
  lead_days INTEGER NOT NULL CHECK (lead_days BETWEEN 0 AND 365),
  was_sent INTEGER NOT NULL DEFAULT 0 CHECK (was_sent IN (0, 1)),
  created_at TEXT NOT NULL CHECK (created_at GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T*Z'),
  FOREIGN KEY (reminder_id, user_id) REFERENCES reminders (id, user_id) ON DELETE CASCADE
) STRICT;

CREATE UNIQUE INDEX reminder_notifications_checkpoint ON reminder_notifications (reminder_id, due_date, lead_days);
CREATE INDEX reminder_notifications_user ON reminder_notifications (user_id);
