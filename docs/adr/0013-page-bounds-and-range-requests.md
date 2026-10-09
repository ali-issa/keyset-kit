# ADR 0013: Page size bounds, defaults, and range requests

- Status: accepted
- Date: 2026-10-08

## Context

The profile fixes the parameters (`page[size]` a positive integer, `page[after]`, `page[before]`)
and the rules for range requests (both cursors: the server MUST use its max page size as the
default, and MUST report `rangeTruncated` when results were cut), but leaves the default and the
maximum page size to the server and makes range support optional. @ref
https://jsonapi.org/profiles/ethanresnick/cursor-pagination/#auto-id--query-parameters @ref
https://jsonapi.org/profiles/ethanresnick/cursor-pagination/#auto-id--links

## Decision

- `page.max` defaults to 100 and `page.default` to `min(20, max)`; the profile's implicit "no
  maximum" is not offered, so an endpoint never returns an unbounded page by omission. Both are
  positive integers with `default <= max`, checked at definition time. A request's `page.size` must
  be a positive integer (`InvalidPageSizeError`) at most `max` (`PageSizeExceededError`, which
  carries the max for the profile's `meta.page.maxSize`).
- Range requests are off unless `page.range` is set (`RangeNotSupportedError` otherwise). On a range
  request the used size is `max` unless the request names one; the query runs forward with both
  seeks; `rangeTruncated` is `true` when more rows than the size matched; `prev` and `next` are
  always present, because the items at both cursors lie outside the range by construction.
- Every page fetches `size + 1` rows to learn whether a further page exists without a count. On a
  first page `prev` is `null`; after a cursor, `prev` is the first row's cursor; an empty page
  points back at the cursors the request came from (`next` is `before`, `prev` is `after`), since
  the items on either side still exist.
- An empty string is not a cursor: `page.after: ''` is `InvalidCursorError` with reason `malformed`,
  as the profile's invalid query parameter rule requires.

## Consequences

Changing a bound is a definition change, not a request-time surprise. A JSON:API layer maps the
three errors to the profile's error objects and the page to its links and meta without further
logic.
