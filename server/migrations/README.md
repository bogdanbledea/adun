# Migrations

Plain SQL files named `NNNN_description.sql` (lower case, underscores), applied
in order at startup by `src/db.ts`, each in its own transaction, and recorded
in `schema_migrations`.

- Append-only: never edit or renumber a file that has been released.
- No `BEGIN`/`COMMIT` inside a file; the runner wraps each one.
- Tables are `STRICT`.
- Foreign keys are off while a migration runs and checked before it commits,
  so a table is rebuilt the SQLite way: create the new table, copy the rows,
  drop the old one, rename the new one, and create its indexes again.
