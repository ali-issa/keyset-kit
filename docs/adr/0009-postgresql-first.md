# ADR 0009: PostgreSQL first

- Status: accepted
- Date: 2026-10-08

## Context

The plan's vocabulary is PostgreSQL's: `ILIKE`, array containment and overlap, `tsvector @@ tsquery`
with `websearch_to_tsquery`, `NULLS FIRST`/`LAST`, `concat_ws`, text casts with parameter type
inference. The applications this library serves run PostgreSQL, and PGlite provides a real
PostgreSQL in-process for tests on every runtime. An abstraction over dialects would cost every
feature its exact shape for a target the project does not have. @ref
https://www.postgresql.org/docs/current/functions-matching.html @ref
https://www.postgresql.org/docs/current/functions-array.html @ref
https://www.postgresql.org/docs/current/textsearch-controls.html @ref https://pglite.dev/

## Decision

The core's predicate kinds and the adapter's rendering target PostgreSQL. The supported floor is
PostgreSQL 14, the oldest major in CI; the e2e suite runs on PGlite, on node-postgres over a PGlite
socket server, and on PostgreSQL 14 and 18 servers. Another database is another adapter package that
renders the predicate kinds its dialect can express and documents the ones it rejects, with an ADR.

## Consequences

Every feature has one exact SQL shape, asserted in the adapter's unit tests and executed in e2e.
MySQL and SQLite users need an adapter that does not exist yet.
