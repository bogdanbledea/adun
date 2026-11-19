-- Food budgets shared with a family. A budget is personal (family_id null,
-- the user's own) or the family's (family_id set). A family's budget is kept
-- by one current member in user_id, its maker or, once they leave, the
-- owner, so that deleting an account does not take it along. No ON DELETE:
-- the family service hands its budgets back or deletes them first.
ALTER TABLE food_budgets ADD COLUMN family_id TEXT REFERENCES families (id);

DROP INDEX food_budgets_user_month;
CREATE UNIQUE INDEX food_budgets_user_month ON food_budgets (user_id, month_key) WHERE family_id IS NULL;
CREATE UNIQUE INDEX food_budgets_family_month ON food_budgets (family_id, month_key) WHERE family_id IS NOT NULL;
