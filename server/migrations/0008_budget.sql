-- The monthly budget: months, their categories and entries.

CREATE TABLE months (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  -- YYYY-MM.
  month_key TEXT NOT NULL
    CHECK (month_key GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]' AND substr(month_key, 6, 2) BETWEEN '01' AND '12'),
  created_at TEXT NOT NULL CHECK (created_at GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T*Z'),
  UNIQUE (user_id, month_key)
) STRICT;

-- Target of the composite foreign keys below: a child row's user is its month's user.
CREATE UNIQUE INDEX months_id_user ON months (id, user_id);

CREATE TABLE categories (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  month_id TEXT NOT NULL,
  -- Entries find their category by name, so a name appears once per month.
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 256),
  sort_order INTEGER NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
  UNIQUE (month_id, name),
  FOREIGN KEY (month_id, user_id) REFERENCES months (id, user_id) ON DELETE CASCADE
) STRICT;

-- Target of the entries' foreign key: an entry's category is in its month.
CREATE UNIQUE INDEX categories_id_month ON categories (id, month_id);

-- Income or an expense. Amounts in bani (1 leu = 100 bani), up to 9,999,999,999 lei.
CREATE TABLE entries (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  month_id TEXT NOT NULL,
  category_id TEXT NOT NULL,
  description TEXT NOT NULL CHECK (length(description) BETWEEN 1 AND 512),
  type TEXT NOT NULL CHECK (type IN ('income', 'expense')),
  amount_bani INTEGER NOT NULL CHECK (amount_bani BETWEEN 0 AND 999999999900),
  sort_order INTEGER NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
  created_at TEXT NOT NULL CHECK (created_at GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T*Z'),
  FOREIGN KEY (month_id, user_id) REFERENCES months (id, user_id) ON DELETE CASCADE,
  FOREIGN KEY (category_id, month_id) REFERENCES categories (id, month_id) ON DELETE CASCADE
) STRICT;

CREATE INDEX entries_month ON entries (month_id);
CREATE INDEX entries_category ON entries (category_id, sort_order);
CREATE INDEX entries_user ON entries (user_id);
