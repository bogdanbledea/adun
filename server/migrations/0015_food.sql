-- Food budgets: a month's food money, kept in sources (a card, cash, meal
-- vouchers), and the purchases paid from them.

CREATE TABLE food_budgets (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  -- YYYY-MM, 2024 to 2099: the years whose working calendar is known.
  month_key TEXT NOT NULL
    CHECK (month_key GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]' AND substr(month_key, 6, 2) BETWEEN '01' AND '12'
           AND substr(month_key, 1, 4) BETWEEN '2024' AND '2099'),
  -- First day this month's money covers; the period ends the day before the
  -- next month's start.
  period_start TEXT NOT NULL CHECK (period_start GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]'),
  -- The client's date when the budget was made. Weeks before it get no
  -- money: nothing was logged in them.
  plan_from TEXT NOT NULL CHECK (plan_from GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]'),
  created_at TEXT NOT NULL CHECK (created_at GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T*Z')
) STRICT;

-- An index rather than a table constraint, so a later migration can replace it.
CREATE UNIQUE INDEX food_budgets_user_month ON food_budgets (user_id, month_key);

-- The budget's total is the sum of its sources and is never stored.
CREATE TABLE food_sources (
  id TEXT PRIMARY KEY,
  budget_id TEXT NOT NULL REFERENCES food_budgets (id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 64),
  -- Up to 1,000,000 lei.
  amount_bani INTEGER NOT NULL CHECK (amount_bani BETWEEN 0 AND 100000000),
  sort_order INTEGER NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
  created_at TEXT NOT NULL CHECK (created_at GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T*Z')
) STRICT;

CREATE INDEX food_sources_budget ON food_sources (budget_id);
-- Target of the purchases' foreign key: a purchase's source is in its budget.
CREATE UNIQUE INDEX food_sources_id_budget ON food_sources (id, budget_id);

CREATE TABLE food_purchases (
  id TEXT PRIMARY KEY,
  budget_id TEXT NOT NULL REFERENCES food_budgets (id) ON DELETE CASCADE,
  -- No ON DELETE (checked at the end of the statement): a source with
  -- purchases cannot be removed alone, but deleting the budget takes both.
  source_id TEXT NOT NULL,
  -- Who added it; null once that account is deleted.
  user_id TEXT REFERENCES users (id) ON DELETE SET NULL,
  merchant TEXT NOT NULL CHECK (length(merchant) BETWEEN 1 AND 64),
  -- 0.01 to 100,000 lei.
  amount_bani INTEGER NOT NULL CHECK (amount_bani BETWEEN 1 AND 10000000),
  spent_on TEXT NOT NULL CHECK (spent_on GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]'),
  note TEXT CHECK (length(note) BETWEEN 1 AND 256),
  created_at TEXT NOT NULL CHECK (created_at GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T*Z'),
  FOREIGN KEY (source_id, budget_id) REFERENCES food_sources (id, budget_id)
) STRICT;

CREATE INDEX food_purchases_budget ON food_purchases (budget_id, spent_on);
CREATE INDEX food_purchases_source ON food_purchases (source_id);
CREATE INDEX food_purchases_user ON food_purchases (user_id);
