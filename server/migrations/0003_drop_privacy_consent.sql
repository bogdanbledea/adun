-- The app no longer records consent to a privacy policy version: what it
-- stores is described on its privacy page, and how a server's data is used is
-- up to whoever runs that server.

ALTER TABLE users DROP COLUMN privacy_accepted_at;
ALTER TABLE users DROP COLUMN privacy_policy_version;
