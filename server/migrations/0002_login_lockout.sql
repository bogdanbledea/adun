-- Consecutive failed sign-ins, and the lock they lead to.

ALTER TABLE users ADD COLUMN failed_login_count INTEGER NOT NULL DEFAULT 0 CHECK (failed_login_count >= 0);
ALTER TABLE users ADD COLUMN locked_until TEXT CHECK (locked_until GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T*Z');
