-- When an entry was actually paid, which may fall in another month than the
-- one it counts in (a card whose statement closes mid-month). Optional; a
-- template entry has none.

ALTER TABLE entries ADD COLUMN payment_date TEXT
  CHECK (payment_date GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]');
