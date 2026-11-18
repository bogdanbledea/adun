# Migrations

Plain SQL files named `NNNN_description.sql` (lower case, underscores), applied
in order at startup by `src/db.ts`, each in its own transaction, and recorded
in `schema_migrations`.

- Append-only: never edit or renumber a file that has been released.
- No `BEGIN`/`COMMIT` inside a file; the runner wraps each one.
- Tables are `STRICT`.
