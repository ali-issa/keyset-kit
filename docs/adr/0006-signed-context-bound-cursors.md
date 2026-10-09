# ADR 0006: Cursors are HMAC-signed, versioned, bound to the request context, with expiry and rotation

- Status: accepted
- Date: 2026-10-08

## Context

The profile makes cursors opaque strings the client passes back. A cursor that is merely the encoded
sort-key values can be edited to point anywhere, and reused under another sort, where its values are
compared against different columns: pages then overlap, skip rows, or let a client probe column
values by crafting cursors. Secrets must be rotatable without invalidating the cursors live clients
hold, and an operator may want cursors to stop working after a while. @ref
https://jsonapi.org/profiles/ethanresnick/cursor-pagination/#auto-id--concepts @ref
https://www.rfc-editor.org/rfc/rfc2104#section-3 @ref
https://www.rfc-editor.org/rfc/rfc4648#section-5 @ref https://www.rfc-editor.org/rfc/rfc8785

## Decision

- A cursor is `base64url(payload) "." base64url(tag)`, no padding. The payload is the JSON
  `{ v, k, c, t }`: the format version, the sort-key values (text or `null`, one per sort key), the
  context hash, and the issue time in seconds. The tag is HMAC-SHA256 over the payload bytes under
  the current secret.
- The context is the SHA-256 (base64url) of the canonical JSON of the resolved sort's signature, the
  request's filter as written, and the trimmed search term. Canonical JSON (RFC 8785 member
  ordering) makes the hash independent of member order. A cursor whose context differs from the
  request's is rejected with reason `context`.
- Decoding verifies before it reads: split, decode, check the tag under the current secret and then
  each previous secret, and only then parse the payload; then check the version, the expiry
  (`t + ttl < now`), the context, and the value count, in that order. Each rejection carries one of
  five reasons (`malformed`, `signature`, `version`, `expired`, `context`), reported by the planner
  as `InvalidCursorError` with the parameter that carried the cursor.
- Secrets are strings or bytes of at least 32 bytes (RFC 2104 discourages keys shorter than the hash
  output), or imported HMAC `CryptoKey`s; the current secret must be usable for signing.
  `previousSecrets` are accepted for verification only, so a rotation is: add the old secret to
  `previousSecrets`, set the new one, deploy, and drop the old one after the longest cursor lifetime
  you care about. `ttl` is optional; without it cursors never expire. The clock is injectable for
  tests.
- The format is versioned (`CURSOR_VERSION`). A change to the payload bumps it, and older cursors
  are rejected with reason `version` rather than misread.

## Consequences

A client cannot forge a cursor, move one between requests, or keep one past the TTL; the values a
cursor carries are only ever compared against the columns they were read from. The payload is
readable (base64url is not encryption): the sort-key values of the row a cursor points at are
visible to its holder, which the documentation states, and a sort over a column the client must not
learn should not be exposed. Every request with a cursor costs one HMAC verification per secret.
