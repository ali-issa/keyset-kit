# ADR 0008: The key is a mandatory tie-breaker; `NULLS LAST` forward, inverted on backward pages

- Status: accepted
- Date: 2026-10-08

## Context

A cursor marks a position in a sorted list, so the profile requires a sort order that is unique for
every item; a sort on `created_at` alone has ties, and a seek on a tied value skips or repeats the
rows that share it. PostgreSQL sorts `NULL` last on `ASC` and first on `DESC` by default, and a seek
predicate over a nullable key has to know where nulls are to say what lies "after" a value or
"after" a null. A page before a cursor needs the rows closest to the cursor, which a forward query
with `limit` cannot produce. @ref
https://jsonapi.org/profiles/ethanresnick/cursor-pagination/#auto-id--concepts @ref
https://www.postgresql.org/docs/current/queries-order.html @ref
https://use-the-index-luke.com/sql/partial-results/fetch-next-page

## Decision

- A definition names `key`: one or more declared column fields that are sortable and not nullable
  and together identify a row. Every resolved sort ends with the key fields not already named,
  ascending, in key order; a key field the request names keeps its place and direction. The order is
  therefore total.
- Every key is ordered with an explicit null placement: `NULLS LAST` in the request's direction. A
  request with only `before` runs inverted (`ASC` becomes `DESC`, `NULLS LAST` becomes
  `NULLS FIRST`) so that `limit` keeps the rows nearest the cursor, and `finishPage` reverses them
  back into request order. A range request (`after` and `before`) runs forward with both seeks.
- The seek predicate (SPEC 6.2) is the disjunction over the keys of "equal on every earlier key and
  beyond on this one", with null-aware terms: beyond a value forward is `> v or is null` (`< v` on a
  descending key), beyond a null forward is nothing, before a value is `< v` (`> v` descending),
  before a null is `is not null`, and equality on a null prefix is `is null`. The seek does not
  consult nullability: on a non-nullable key the `is null` branch is never true.

## Consequences

Walking forward and backward visits the same rows in the same order, across ties and nulls; the e2e
invariants check this over eight sorts and three page sizes on three databases. An index on the sort
columns followed by the key columns serves the seek. Sorting by an aggregate (a correlated subquery)
is total too, because the key breaks its ties. A nullable column cannot be a key; a composite key
over a nullable column needs `coalesce` in a generated column instead.
