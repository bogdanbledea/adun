-- When a food month's money starts: the 1st of the month, or payday, counted
-- as the N-th working day. A budget keeps the start it opened with, so
-- changing this moves only months without a budget.

ALTER TABLE users ADD COLUMN food_period_rule TEXT NOT NULL DEFAULT 'calendar'
  CHECK (food_period_rule IN ('calendar', 'working_day'));
ALTER TABLE users ADD COLUMN food_payday_working_day INTEGER NOT NULL DEFAULT 3
  CHECK (food_payday_working_day BETWEEN 1 AND 10);
