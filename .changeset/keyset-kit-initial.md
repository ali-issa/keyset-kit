---
'keyset-kit': minor
---

First release: keyset pagination for any JavaScript runtime, database-free.

- `defineKeyset` declares once what a collection can sort, filter, and search on: column fields of
  twelve scalar types and arrays, aggregate fields over relations (`count`, `max`, `min`, `sum`,
  `avg`), relations with their own filterable fields, a `like` or full-text search, the key that
  breaks every tie, the default sort, the page size bounds, and the cursor secret. A mistake in the
  definition is a `TypeError` naming the option.
- `plan` validates a request (sort, a typed filter tree with a per-type operator table, search, page
  size, cursors) and returns a query plan: the sort keys with their null placement, the filter and
  seek predicates as data, the limit, and the context cursors are bound to.
- `page` assembles the result from the fetched rows: a cursor per row, `prev` and `next`, `hasPrev`
  and `hasNext`, the optional total, and `rangeTruncated`, as the Cursor Pagination profile
  prescribes.
- Cursors are HMAC-SHA256 signed through Web Crypto, versioned, bound to the sort, filter, and
  search they were issued for, with optional expiry and secret rotation.
- Every request-time problem is a typed `KeysetError` with a constant message and structured fields.
