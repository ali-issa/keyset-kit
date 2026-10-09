---
'kysely-keyset': minor
---

First release: keyset pagination for Kysely on PostgreSQL.

- `createDefineKeyset<DB>()` returns a `defineKeyset` that checks every table, column, relation, and
  search name of a definition against the application's Kysely `DB` interface and whose keysets
  carry `paginate`.
- `paginate(query, request, options)` plans the request with keyset-kit, renders the filter, seek,
  key selections, ordering, and limit onto the caller's own select query, runs it, and returns the
  page with the caller's rows untouched. `total: true` runs the count query; `onQuery` reports each
  statement with its SQL, parameters, and timing.
- Column references are `table.column`, so a `CamelCasePlugin` maps them like the application's own
  queries; aggregates are correlated scalar subqueries; relation filters are `exists`; search is
  `ILIKE` over `concat_ws` or `tsvector @@ tsquery`.
- Everything keyset-kit exports is re-exported, so an application imports from one package.
