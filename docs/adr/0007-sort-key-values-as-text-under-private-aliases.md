# ADR 0007: Sort-key values travel as text under private aliases

- Status: accepted
- Date: 2026-10-08

## Context

A cursor must round-trip a sort-key value exactly: the seek compares the column against the value
the row had, and any loss produces a skipped or repeated row. Drivers parse values for the
application's convenience, not for exactness: node-postgres turns `timestamptz` into a `Date`
(milliseconds; microseconds are lost), `numeric` and `bigint` into strings, and type parsers are
configurable per application. The caller's selection must also stay the caller's: the page should
not change what their columns look like. PostgreSQL infers a parameter's type from its context, so a
text value bound against a typed column is cast by the server. @ref
https://www.postgresql.org/docs/current/sql-expressions.html#SQL-SYNTAX-TYPE-CASTS @ref
https://www.postgresql.org/docs/current/datatype-datetime.html#DATATYPE-DATETIME-OUTPUT @ref
https://node-postgres.com/features/types

## Decision

- `paginate` adds one selection per sort key: `cast(<target> as text) as "keysetN"`, where `N` is
  the key's position. The cursor stores the text (or `null`); the seek binds it as a parameter, and
  PostgreSQL casts it back to the column's type for the comparison.
- The aliases `keyset0`, `keyset1`, ... are reserved: `paginate` reads them from each fetched row
  and removes them before the rows reach the caller. They contain no underscore or capital, so a
  `CamelCasePlugin` leaves them alone.
- The caller's own columns are untouched: whatever the driver parses them into is what the page
  holds.
- The text form of a `timestamptz` carries the session's time zone, so the same instant produces
  different text under different `TimeZone` settings (PGlite follows the host's zone). Comparisons
  are exact in every session because the text is self-describing; cursors are not byte-identical
  across sessions with different zones. The documentation recommends a fixed `TimeZone` on the
  application's connections.

## Consequences

Cursors are driver-independent: a cursor issued through node-postgres decodes to the same values as
one issued through PGlite's in-process dialect (e2e 11.2 proves it), microsecond timestamps and
arbitrary-precision numerics survive, and no type parser configuration can break a page. A caller
who selects a column named `keyset0` loses it; the name is documented as reserved.
