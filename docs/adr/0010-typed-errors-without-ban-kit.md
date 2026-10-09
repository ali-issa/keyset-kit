# ADR 0010: Typed error classes with constant messages; no ban-kit dependency

- Status: accepted
- Date: 2026-10-08

## Context

The sibling library `jsonapi-kit` raises ban-kit errors, which carry an HTTP status and render as
JSON:API error documents. keyset-kit sits below the HTTP layer: it runs in request handlers, but
also in workers, scripts, and tests, and its consumers include API layers with error catalogs of
their own. The HTTP mapping (status, the profile's error `type` links, `source.parameter`) is the
API layer's decision. An error message that includes a request value could end up in a response body
or a log where it does not belong. @ref
https://jsonapi.org/profiles/ethanresnick/cursor-pagination/#auto-id--errors

## Decision

- Every request-time error is an instance of a `KeysetError` subclass with a stable `code` and the
  detail in structured fields (SPEC 9): `InvalidCursorError` (parameter, reason),
  `UnsupportedSortError` (fields), `UnsupportedFilterError` (field, operator), `InvalidFilterError`
  (path), `InvalidFilterValueError` (field, operator, expected), `UnsupportedSearchError`,
  `InvalidPageSizeError` (requested), `PageSizeExceededError` (requested, max),
  `RangeNotSupportedError`.
- Messages are constant per class. No request value, column name, or SQL ever appears in `message`.
- Definition mistakes are `TypeError`s thrown by `defineKeyset`; they are programming errors, not
  request errors.
- The core has no dependency on ban-kit or any other library. The README documents the mapping to
  the profile's error objects and to `jsonapi-kit`'s helpers.

## Consequences

An API layer maps `code` to its catalog in one `switch`; a worker logs the fields. The library
cannot render an error response, which it never needed to.
