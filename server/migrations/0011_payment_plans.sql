-- Payment plans: a purchase paid in monthly instalments, each one an expense
-- in its month. An instalment is an entry with plan_id and installment_index
-- set. SQLite cannot add a table constraint in place, so entries is built
-- again (the runner has foreign keys off, and checks them before committing).

CREATE TABLE payment_plans (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 256),
  installments INTEGER NOT NULL CHECK (installments BETWEEN 1 AND 360),
  total_bani INTEGER NOT NULL CHECK (total_bani BETWEEN 1 AND 999999999900),
  first_month_key TEXT NOT NULL
    CHECK (first_month_key GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]' AND substr(first_month_key, 6, 2) BETWEEN '01' AND '12'),
  category_name TEXT NOT NULL CHECK (length(category_name) BETWEEN 1 AND 256),
  -- When the item was bought or the contract signed.
  purchase_date TEXT CHECK (purchase_date GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]'),
  closed_at TEXT CHECK (closed_at GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T*Z'),
  created_at TEXT NOT NULL CHECK (created_at GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T*Z')
) STRICT;

CREATE INDEX payment_plans_user ON payment_plans (user_id);
-- Target of the instalments' foreign key: an instalment's plan is its user's.
CREATE UNIQUE INDEX payment_plans_id_user ON payment_plans (id, user_id);

CREATE TABLE entries_new (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  month_id TEXT NOT NULL,
  category_id TEXT NOT NULL,
  description TEXT NOT NULL CHECK (length(description) BETWEEN 1 AND 512),
  type TEXT NOT NULL CHECK (type IN ('income', 'expense')),
  amount_bani INTEGER NOT NULL CHECK (amount_bani BETWEEN 0 AND 999999999900),
  sort_order INTEGER NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
  -- Set together on an instalment. No ON DELETE: deleting a plan deletes its
  -- instalments first, and SET NULL would also clear user_id.
  plan_id TEXT,
  installment_index INTEGER CHECK (installment_index BETWEEN 1 AND 360),
  created_at TEXT NOT NULL CHECK (created_at GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T*Z'),
  CHECK ((plan_id IS NULL) = (installment_index IS NULL)),
  FOREIGN KEY (month_id, user_id) REFERENCES months (id, user_id) ON DELETE CASCADE,
  FOREIGN KEY (category_id, month_id) REFERENCES categories (id, month_id) ON DELETE CASCADE,
  FOREIGN KEY (plan_id, user_id) REFERENCES payment_plans (id, user_id)
) STRICT;

INSERT INTO entries_new (id, user_id, month_id, category_id, description, type, amount_bani, sort_order, created_at)
SELECT id, user_id, month_id, category_id, description, type, amount_bani, sort_order, created_at FROM entries;

DROP TABLE entries;
ALTER TABLE entries_new RENAME TO entries;

CREATE INDEX entries_month ON entries (month_id);
CREATE INDEX entries_category ON entries (category_id, sort_order);
CREATE INDEX entries_user ON entries (user_id);
CREATE INDEX entries_plan ON entries (plan_id);
