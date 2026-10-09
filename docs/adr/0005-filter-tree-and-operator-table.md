# ADR 0005: The filter is a typed tree with a per-type operator table

- Status: accepted
- Date: 2026-10-08

## Context

JSON:API reserves the `filter` query parameter family and leaves its strategy to the server; URL
grammars belong to the API layer (`jsonapi-kit` parses `filter[field][op]=v` into conditions). The
pagination layer has to turn conditions into SQL safely: an undeclared column name must never reach
a query, a value must match the column's type, and nothing may be dropped silently. Query strings
carry only text, so `18`, `true`, and `2024-01-01` arrive as strings even when the column is an
integer, a boolean, or a date. @ref https://jsonapi.org/format/1.1/#fetching-filtering @ref
https://www.postgresql.org/docs/current/functions-comparison.html @ref
https://www.postgresql.org/docs/current/functions-matching.html#FUNCTIONS-LIKE @ref
https://www.postgresql.org/docs/current/functions-array.html

## Decision

- The request's filter is data: a condition `{ field, op, value }`, the combinators `and`, `or`, and
  `not`, and `{ relation, some }` for "at least one related row matches". A condition on
  `relation.field` is shorthand for a one-condition `some`.
- One operator table by field type (SPEC 4.2): equality and membership for every scalar type except
  that booleans get equality only; ordering and `between` for text, numbers, and temporals; seven
  pattern operators for text, the `i` suffix meaning `ILIKE`; `contains`, `containedBy`, and
  `overlaps` for arrays (`@>`, `<@`, `&&`); `isNull` for nullable fields. A definition narrows a
  field's operators with `operators`; it cannot widen them. Aggregate fields take the operators of
  their type without the patterns.
- Values are checked by the field's type (SPEC 4.3), in JSON form or in the type's canonical text
  form. Temporal and arbitrary-precision values stay strings so microseconds and digits survive; the
  database parses them. An enum value must be one of the declared labels.
- Pattern values are escaped (`\\`, `%`, `_`) and bound as parameters; the pattern shape is the
  operator's (`%v%`, `v%`, `%v`, `v`). On a field with the `insensitive` collation every comparison
  lowercases the value and compares through `lower()`, and every pattern is `ILIKE`.
- `in` and `nin` with an empty list fold to `false` and `true`; `between` takes exactly two values.
- Every problem is an error: an unknown field or relation path and an operator the field does not
  accept are `UnsupportedFilterError`; a value the type rejects is `InvalidFilterValueError` with
  the expected form; a node that is not one of the five shapes is `InvalidFilterError` with its
  path.

## Consequences

An API layer converts its grammar to the tree and gets typed 400s for free. Clients get a
predictable operator set per type, documented in one table. Adding an operator is a table row, a
condition mapping, a render case, a SPEC row, and an amendment to this ADR.
