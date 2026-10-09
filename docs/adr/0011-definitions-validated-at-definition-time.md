# ADR 0011: Definitions are validated at definition time, never at request time

- Status: accepted
- Date: 2026-10-08

## Context

A keyset definition can be wrong in ways that only surface when a client sends the request that
exercises them: a key over a nullable column, a default sort naming an unsortable field, an operator
the field's type does not accept, an aggregate over an undeclared relation, a search configuration
name that is not a valid `regconfig`, a page default above the max, a secret shorter than the HMAC
digest. Surfacing those as request errors punishes the client for the server's mistake and hides the
bug until production. @ref https://www.postgresql.org/docs/current/textsearch-controls.html @ref
https://www.rfc-editor.org/rfc/rfc2104#section-3

## Decision

`defineKeyset` validates everything at the call and throws `TypeError` naming the option: the table,
every field (name grammar, type vocabulary, nullability, sortability, the operator subset, enum
labels, array element types, collation), every relation (table, join pairs, column-only fields),
aggregates (declared relation, function, column, type), the key (declared, sortable, non-nullable
column fields, no repeats), the default sort (resolved like a request), the search (mode, source,
configuration name), the page bounds, and the cursor options (secret length or key usages, previous
secrets, TTL). Request-time code assumes a valid definition and never re-checks it; the adapter's
typed definer adds compile-time checks of every name against the Kysely `DB` interface.

## Consequences

Definition mistakes fail at startup with a message naming the option, and an application's test
suite can assert them. The planner and the adapter stay small.
