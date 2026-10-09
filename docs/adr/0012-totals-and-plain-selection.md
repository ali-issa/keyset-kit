# ADR 0012: Totals are an opt-in second query; the base query must be a plain selection

- Status: accepted
- Date: 2026-10-08

## Context

The profile makes `total` optional metadata, and `count(*)` over a filtered table is a full or index
scan that can cost more than the page. The adapter rewrites the caller's query: it adds `where`
clauses, replaces `order by`, `limit`, and `offset`, and adds selections under private aliases. That
rewrite is sound only when the query is a plain selection of the definition's table. @ref
https://jsonapi.org/profiles/ethanresnick/cursor-pagination/#auto-id--meta @ref
https://www.postgresql.org/docs/current/sql-select.html @ref
https://kysely.dev/docs/recipes/expressions

## Decision

- `paginate` runs one query by default. With `total: true` it first runs
  `select count(*) as "total"` over the filtered query with the selection, ordering, limit, and
  offset cleared: the count covers the filter and the search, never the cursors, so it is the size
  of the whole collection the client is paging through. The two statements are not in a transaction;
  under concurrent writes the total may differ from what the pages add up to.
- The base query MUST be a select from the definition's `table` (its name or alias, as the base
  query exposes it) without `distinct`, `group by`, `having`, or set operations, and without a
  `limit` or `offset` the caller expects to survive. Its own `where` clauses are kept and combined
  with the filter. Joins are allowed when they keep one row per row of the main table; a join that
  multiplies rows breaks the one-row-per-key assumption the seek relies on. The requirement is
  documented, not enforced at runtime.
- `onQuery` reports each statement (`page` or `total`) with its SQL, parameters, duration, and row
  count, so an application can log or meter the cost.

## Consequences

The common case costs one round trip, and the count is explicit where it is paid for. Applications
that need cheap totals on large tables estimate them themselves (the profile's
`estimatedTotal.bestGuess` exists for that). The plain-selection rule is a contract callers must
read.
