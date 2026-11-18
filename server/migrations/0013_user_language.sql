-- The language emails are written in when no request says it, as for the
-- reminder emails sent by the hourly sweep. Set at registration, at each
-- sign-in and when the user switches language.

ALTER TABLE users ADD COLUMN language TEXT NOT NULL DEFAULT 'ro' CHECK (language IN ('ro', 'en'));
