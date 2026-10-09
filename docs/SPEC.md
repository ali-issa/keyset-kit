# keyset-kit: implementation specification

- Status: normative for the 0.x line of `keyset-kit` and `kysely-keyset`; `docs/DESIGN.md` explains
  the why

The key words MUST, MUST NOT, SHOULD, and MAY are used as in RFC 2119. Every section names the
source file that implements it and the tests that prove it. When this document and the code
disagree, fix one of them in the same pull request. "The profile" is the JSON:API
[Cursor Pagination profile](https://jsonapi.org/profiles/ethanresnick/cursor-pagination/);
PostgreSQL references are to the current manual.

Contents

1. Public surface and module map
2. Internals
3. Definitions
4. Filters
5. Sort
6. The query plan
7. Pages
8. Cursors
9. Errors
10. Kysely adapter (`kysely-keyset`)
11. Test plan
12. Packaging
13. Constants

---

## 1. Public surface and module map

Two packages, one repository (ADR 0004). `keyset-kit` is the database-free core: every module is a
function over plain values and none imports a query builder, a driver, or a runtime API beyond web
standards (ADR 0002). `kysely-keyset` is the Kysely adapter: it depends on `keyset-kit`, re-exports
all of it (one import for a Kysely application), and adds the typed definer, `paginate`, and the
render functions (section 10). `kysely >= 0.28.0` is its only peer dependency.

| Package         | Exports                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `keyset-kit`    | Values: `defineKeyset`, `createPlanner`, `finishPage`, `createCursorCodec`, `resolveSort`, `sortSignature`, `resolvePage`, `seekPredicate`, `keyAlias`, `checkScalar`, `operatorsFor`, `isOperator`, `escapeLike`, `isKeysetError`, the error classes `KeysetError`, `InvalidCursorError`, `UnsupportedSortError`, `UnsupportedFilterError`, `InvalidFilterError`, `InvalidFilterValueError`, `UnsupportedSearchError`, `InvalidPageSizeError`, `PageSizeExceededError`, `RangeNotSupportedError`, and the constants `OPERATORS`, `CURSOR_VERSION`, `MIN_SECRET_BYTES`, `DEFAULT_PAGE_SIZE`, `DEFAULT_MAX_PAGE_SIZE`; and every type in sections 3 to 9 (`KeysetInit`, `KeysetDefinition`, `Keyset`, `KeysetRequest`, `KeysetRequestOf`, `NoRelations`, the field and relation init and normalized types, `Filter` and its node types, `Operator`, `ScalarValue`, `ScalarCheck`, `SortInput`, `SortField`, `QueryPlan`, `PlanKey`, `Predicate`, `Target` and its kinds, `CursorValue`, `PageInput`, `ResolvedPage`, `Page`, `FinishOptions`, `CursorCodec`, `CursorCodecOptions`, `CursorDecodeResult`, `InvalidCursorReason`, `KeysetErrorCode`) |
| `kysely-keyset` | Everything of `keyset-kit` (the same bindings), plus `createDefineKeyset`, `paginate`, `renderPredicate`, `renderTarget`; and the types `DefineKeyset`, `KyselyKeyset`, `TypedKeysetInit`, `TypedFieldsInit`, `TypedColumnFieldInit`, `TypedAggregateFieldInit`, `TypedRelationsInit`, `TypedRelationInit`, `TypedSearchInit`, `RelationsOf`, `PaginateOptions`, `QueryEvent`, `RenderContext`, `AnyDatabase`, `AnyExpressionBuilder`, `AnyQuery`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |

`e2e/package-surface.e2e.test.ts` asserts the exact value export list of both packages against the
built packages, and that the adapter's re-exports are the core's own bindings.

Source layout. Every module with behavior has a sibling `*.test.ts`; contract types have
`*.test-d.ts`. Type-only modules (`types.ts` files) are covered through their consumers; coverage
thresholds apply to all of `packages/*/src/`. Imports form a DAG (`import/no-cycle` is enforced,
type-only imports included); nothing under `packages/keyset-kit` imports `kysely`, and
`packages/kysely-keyset` imports the core only through its package name.

```
packages/keyset-kit/src/
  index.ts                     root entry
  errors.ts                    section 9
  internal/
    base64url.ts               encodeBase64Url(), decodeBase64Url(), utf8Encode(), utf8Decode(), toBytes() (2.1)
    crypto.ts                  sha256Base64Url(), importHmacKey(), hmacSign(), hmacVerify() (2.2)
    object.ts                  PROTO_KEYS, isRecord(), ownEntries(), ownMember(), describe() (2.3)
    canonical.ts               canonicalJson() (2.4)
    like.ts                    escapeLike() (2.5)
  definition/
    types.ts                   section 3
    field-types.ts             the vocabularies as type guards (3.1)
    normalize-fields.ts        normalizeFields(), normalizeColumnField(), assertName(), assertIdentifier() (3.1, 3.2)
    normalize-relations.ts     normalizeRelations() (3.3)
    define-keyset.ts           defineKeyset(), DEFAULT_PAGE_SIZE, DEFAULT_MAX_PAGE_SIZE (3.4, 3.5)
  filter/
    types.ts                   Filter, FilterCondition, RelationFilter, RelationFieldMap (4.1)
    normalize.ts               normalizeFilter() (4.1)
    operators.ts               OPERATORS, operatorsFor(), isOperator(), isPatternOperator(), isArrayOperator(), comparisonOf() (4.2)
    condition.ts               conditionPredicate(), targetOf() (4.2)
    values.ts                  checkScalar() (4.3)
  sort/resolve-sort.ts         resolveSort(), resolveSortItems(), sortSignature() (5)
  plan/
    types.ts                   QueryPlan, PlanKey, Predicate, Target, CursorValue (6)
    plan.ts                    createPlanner(), keyAlias(), KeysetRequest (6.1)
    seek.ts                    seekPredicate() (6.2)
  page/
    page-request.ts            resolvePage(), PageInput, ResolvedPage (7.1)
    finish.ts                  finishPage(), Page, FinishOptions (7.2)
  cursor/codec.ts              createCursorCodec(), CURSOR_VERSION, MIN_SECRET_BYTES (8)
  test-support/                the shared definition and helpers for the repository's own tests; not published
packages/kysely-keyset/src/
  index.ts                     root entry: re-exports keyset-kit, adds section 10
  types.ts                     KyselyKeyset, PaginateOptions, QueryEvent, RenderContext, the widened Kysely shapes (10)
  define-keyset.ts             createDefineKeyset(), the Typed*Init types, RelationsOf (10.1)
  render/target.ts             renderTarget(), concat() (10.2)
  render/predicate.ts          renderPredicate() (10.2)
  paginate.ts                  paginate() (10.3)
  test-support/                a compile-only Kysely and a canned-rows driver; not published
```

---

## 2. Internals (`packages/keyset-kit/src/internal/`)

Never exported. Each is a small, fully tested primitive the rest of the core builds on.

### 2.1 base64url and UTF-8 (`base64url.ts`)

`Bytes` is `Uint8Array<ArrayBuffer>`: every byte array the core handles is backed by a plain
`ArrayBuffer` so it satisfies Web Crypto's `BufferSource`. `encodeBase64Url(bytes)` is RFC 4648
section 5 without padding, over `btoa`. `decodeBase64Url(text)` returns `null` for a character
outside `A-Za-z0-9_-`, a length congruent to 1 modulo 4, or anything `atob` rejects; otherwise the
bytes. `utf8Encode(text)` and `utf8Decode(bytes)` use `TextEncoder` and a fatal `TextDecoder`;
`utf8Decode` returns `null` for bytes that are not well-formed UTF-8. `toBytes(view)` copies any
`Uint8Array` into its own buffer.

Tests: `base64url.test.ts` (alphabet, round trip of every byte value, rejected inputs, UTF-8).

### 2.2 Web Crypto (`crypto.ts`, ADR 0002)

`sha256Base64Url(text)` is the SHA-256 of the text's UTF-8 bytes, base64url encoded.
`importHmacKey(secret)` imports a string's UTF-8 bytes or raw bytes as a non-extractable HMAC
SHA-256 key usable for `sign` and `verify`. `hmacSign(key, data)` returns the 32-byte tag;
`hmacVerify(key, signature, data)` is `SubtleCrypto.verify`, whose comparison is the runtime's
constant-time one.

Tests: `crypto.test.ts` (SHA-256 of `abc`; RFC 4231 test case 2; verification under the wrong key or
over other bytes fails).

### 2.3 Prototype-safe objects (`object.ts`)

`PROTO_KEYS` is `__proto__`, `constructor`, `prototype`. `isRecord(value)` is true for a non-null
object that is not an array. `ownEntries(object)` lists own members in insertion order, skipping
`PROTO_KEYS`. `ownMember(object, key)` reads an own member that is not a prototype key, else
`undefined`. `describe(value)` is the value's JSON text for an error label, or its `typeof` when
JSON cannot represent it. A name from a request or a definition MUST reach a lookup or an assignment
only through these helpers, a `ReadonlyMap`, or a `ReadonlySet`.

Tests: `object.test.ts`.

### 2.4 Canonical JSON (`canonical.ts`)

`canonicalJson(value)` serializes with object members sorted by key at every depth, `undefined`
members dropped, `undefined` array items as `null`, bigints as decimal strings, and no whitespace:
the member ordering rule of RFC 8785 (number formatting is `JSON.stringify`'s). Two structurally
equal values produce the same text, so the cursor context (6.1) does not depend on the order a
caller wrote the filter's members in.

Tests: `canonical.test.ts`.

### 2.5 LIKE escaping (`like.ts`)

`escapeLike(value)` prefixes `\`, `%`, and `_` with `\`, PostgreSQL's default escape character, so a
request value matches literally inside a pattern. Patterns are bound as parameters, never written
into SQL, so no further quoting applies.

Tests: `like.test.ts`.

---

## 3. Definitions (`definition/`)

`KeysetInit<TFields, TRelations>`, the argument of `defineKeyset` (3.5):

| Member      | Meaning                                                                                                   |
| ----------- | --------------------------------------------------------------------------------------------------------- |
| `table`     | The main table as the base query exposes it (its name or alias); a non-empty string                       |
| `key`       | Field names that together identify a row; the sort's tie-breaker (5)                                      |
| `fields`    | By name: column fields (3.1) and aggregate fields (3.2); at least one                                     |
| `relations` | By name: related tables with join columns and their own filterable fields (3.3); default none             |
| `search`    | A `like` or full-text search (3.4); default none, and a request with `search` is `UnsupportedSearchError` |
| `sort`      | `{ default }`: the sort applied when a request names none; default the key, ascending                     |
| `page`      | `{ default, max, range }`: page size bounds and whether range requests are allowed (7.1, ADR 0013)        |
| `cursor`    | `{ secret, previousSecrets, ttl }` (8)                                                                    |

Names of fields and relations are the request's vocabulary and MUST match
`^[A-Za-z0-9][A-Za-z0-9_-]*$` and not be a prototype key (2.3). Table and column names are the
database's and are opaque non-empty strings here; the adapter resolves them (10).

### 3.1 Column fields (`types.ts`, `field-types.ts`, `normalize-fields.ts`)

Field types: the scalar types `text`, `integer`, `bigint`, `decimal`, `float`, `boolean`, `uuid`,
`enum`, `date`, `time`, `timestamp`, `timestamptz`, and `array`.

| Member      | Rule                                                                                                                                             |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `column`    | A non-empty string                                                                                                                               |
| `type`      | One of the field types                                                                                                                           |
| `nullable`  | Boolean; default `false`. A nullable field accepts `isNull` (4.2)                                                                                |
| `sortable`  | Boolean; default `true`, except `array`, where it defaults to `false` and MUST NOT be `true`                                                     |
| `operators` | A subset of the operators the type accepts (4.2), plus `isNull` when nullable; default all of them. An operator outside the set is a `TypeError` |
| `collation` | `default` or `insensitive`; `insensitive` is allowed on `text` only and compares, matches, and sorts through `lower()` (4.2, 10.2)               |
| `values`    | `enum` only, required: a non-empty array of distinct strings, the accepted labels                                                                |
| `of`        | `array` only, required: the element type, a scalar type other than `enum`                                                                        |

The normalized `ColumnField` is
`{ kind: 'column', name, column, type, nullable, sortable, operators (a ReadonlySet), values (labels or null), of (element type or null), collation }`.
Every mistake is a `TypeError` whose message names the option (`fields.age.type ...`).

Tests: `field-types.test.ts`, `normalize-fields.test.ts` (defaults, `isNull`, narrowed and rejected
operators, enum and array requirements, collation, every malformed member, name grammar, prototype
keys ignored).

### 3.2 Aggregate fields (`normalize-fields.ts`)

`{ aggregate: { relation, fn, column? }, type, nullable?, sortable?, operators? }` is a value
computed over a relation's rows: `relation` MUST name a declared relation; `fn` is `count`, `max`,
`min`, `sum`, or `avg`; `column` is a column of the relation's table and is required unless `fn` is
`count`; `type` is what the function produces: a scalar type other than `boolean`, `uuid`, or
`enum`. `nullable` defaults to `true` except for `count` (which is `0` with no related rows);
`sortable` defaults to `true`; `operators` is a subset of the type's operators without the pattern
operators (an aggregate is a subquery, not a column). The normalized `AggregateField` is
`{ kind: 'aggregate', name, relation, fn, column, type, nullable, sortable, operators }`.

Tests: `normalize-fields.aggregate.test.ts`.

### 3.3 Relations (`normalize-relations.ts`)

`{ table, on, fields? }`: `table` a non-empty string; `on` an object with at least one pair whose
key is a column of the related table and whose value is a column of the main table, kept in order;
`fields` column fields (3.1) of the related table, addressable in a filter as `relation.field` or
inside `{ relation, some }` (4.1); an aggregate under a relation's `fields` is a `TypeError`.
Relations are addressable from the main table's scope only: a relation's fields cannot name
relations of their own. The normalized `Relation` is
`{ name, table, on: [[related, main], ...], fields: ReadonlyMap }`.

Tests: `normalize-relations.test.ts`.

### 3.4 Search (`define-keyset.ts`)

`search` is one of:

- `{ mode: 'like', columns }`: `ILIKE '%term%'` over the columns joined with spaces (6.1).
- `{ mode?, columns, config? }`: full-text search over
  `to_tsvector(config, concat_ws(' ', columns))`.
- `{ mode?, vector, config? }`: full-text search over a `tsvector` column the application maintains.

`mode` defaults to `websearch` and MUST be `websearch`, `plain`, or `phrase` (the `tsquery` parser:
`websearch_to_tsquery`, `plainto_tsquery`, `phraseto_tsquery`). `config` defaults to `simple` and
MUST match `^[a-z_][a-z0-9_]{0,62}$`, the name syntax of a `regconfig`; it is the one value the
adapter emits as a literal (10.2). `columns` and `vector` are exclusive; `columns` MUST be a
non-empty array of non-empty strings. The normalized `SearchSpec` is `{ mode: 'like', columns }` or
`{ mode, source: { columns } | { vector }, config }`; `null` when absent.

Tests: `define-keyset.test.ts` (`search`).

### 3.5 `defineKeyset(init)` (`define-keyset.ts`, ADR 0011)

Validates once and throws `TypeError` naming the option, in this order: `table`; `relations` (3.3);
`fields` (3.1, 3.2); `key`: a non-empty array of distinct names, each a declared column field that
is sortable and not nullable (so never an array); `search` (3.4); `page`: `max` a positive integer,
default 100, `default` a positive integer, default `min(20, max)`, `default <= max`, and `range` a
boolean, default `false`; `cursor` (8); `sort.default`: an array of sort inputs resolved as a
request's sort would be (5), so an unknown or unsortable field is a `TypeError` with the
`UnsupportedSortError` as `cause`. The normalized `KeysetDefinition` is
`{ table, key, fields: ReadonlyMap, relations: ReadonlyMap, search, sort: { default }, page: { default, max, range }, cursor: { ttl } }`.

Returns `Keyset<TFields, TRelations>`: `definition`; `plan(request)` (6.1); and
`page(plan, rows, values, options?)` (7.2). The literal types of the field and relation names are
inferred (`const` type parameters) and carried on the result: `KeysetRequestOf<TFields, TRelations>`
accepts in `sort` only the sortable fields (`SortableFieldOf`: not `array`, not `sortable: false`),
in `filter` the declared fields and every `relation.field` path (`RelationFieldPath`), and in
`{ relation, some }` each relation's own fields (`RelationFieldsOf`). `NoRelations` is the relations
type of a definition without `relations`, under which a relation filter is a type error.

Tests: `define-keyset.test.ts` (defaults, page bounds, key rules, default sort, search, cursor,
non-objects), `define-keyset.test-d.ts` (inference of sortable fields, relation paths, request
typing, rejection of relation filters without relations).

---

## 4. Filters (`filter/`, ADR 0005)

### 4.1 The tree (`types.ts`, `normalize.ts`)

`Filter<TField, TRelationFields>` is one of five node shapes. A node MUST be a plain object with
exactly the members of one shape (members set to `undefined` do not count); anything else is
`InvalidFilterError(path)`, where `path` is the member names and array indexes from the root
(`['and', 1, 'not']`).

| Node                              | Meaning                                                                                                                                                                 |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `{ field, op, value? }`           | A condition (4.2). `field` and `op` MUST be strings; `op` MUST be an operator (`UnsupportedFilterError(field, op)` otherwise); `value` is absent only for `isNull`      |
| `{ and: [...] }`, `{ or: [...] }` | Every, or at least one, of the items; the member MUST be an array; an empty `and` is true and an empty `or` is false                                                    |
| `{ not: node }`                   | The negation                                                                                                                                                            |
| `{ relation, some: node }`        | At least one row of the relation satisfies `some`, which is normalized in the relation's scope: its fields are the relation's, and no relation is addressable inside it |

A condition's `field` is looked up in the current scope's fields (`UnsupportedFilterError(field)`
when undeclared). A `field` of the form `relation.field` in the main scope MUST name a declared
relation and one of its fields, and is the one-condition form of `{ relation, some }`: it becomes an
`exists` predicate (6) over the relation with the condition inside. A `relation` member MUST name a
declared relation (`UnsupportedFilterError` with the name, or with the value's description when it
is not a string). `normalizeFilter(definition, filter?)` returns the `Predicate` (6) or `null` when
there is no filter.

Tests: `normalize.test.ts` (combinators at depth, paths of malformed nodes, relation paths, relation
nodes and nesting).

### 4.2 Operators (`operators.ts`, `condition.ts`)

The operator table. "Types" is the field types that accept the operator; a definition MAY narrow a
field's set with `operators` and MUST NOT widen it.

| Operator                                                                             | Types                                         | Value                                  | Predicate (6)                                                                                  |
| ------------------------------------------------------------------------------------ | --------------------------------------------- | -------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `eq`, `ne`                                                                           | every scalar type                             | one scalar (4.3)                       | `compare` with `=`, `!=`                                                                       |
| `in`, `nin`                                                                          | every scalar type except `boolean`            | an array of scalars                    | `in` (negated for `nin`); an empty array is `literal` false (`in`) or true (`nin`)             |
| `gt`, `gte`, `lt`, `lte`                                                             | `text`, the numeric types, the temporal types | one scalar                             | `compare` with `>`, `>=`, `<`, `<=`                                                            |
| `between`                                                                            | the same                                      | `[low, high]`, exactly two scalars     | `between`                                                                                      |
| `isNull`                                                                             | any nullable field, aggregates included       | a boolean, default `true`              | `null` (`IS NULL`; `IS NOT NULL` for `false`)                                                  |
| `contains`, `startsWith`, `endsWith`, `eqi`, `containsi`, `startsWithi`, `endsWithi` | `text` column fields                          | a string                               | `like` with the escaped value in `%v%`, `v%`, `%v`, `v`; `ILIKE` for the `i` forms (see below) |
| `contains`, `containedBy`, `overlaps`                                                | `array`                                       | an array of values of the element type | `array` with `@>`, `<@`, `&&`                                                                  |

`contains` on a `text` field is the pattern operator; on an `array` field the containment operator.
The numeric types are `integer`, `bigint`, `decimal`, `float`; the temporal types `date`, `time`,
`timestamp`, `timestamptz`. `boolean` accepts `eq` and `ne` only; `uuid` and `enum` accept `eq`,
`ne`, `in`, `nin`.

`conditionPredicate(table, relations, field, op, value, name)` builds the predicate: the operator
MUST be in the field's set (`UnsupportedFilterError(name, op)`); the target is the field's column
(`targetOf`: `{ kind: 'column', table, column, type, lower }`) or its aggregate
(`{ kind: 'aggregate', relation, fn, column, type }`); values are checked by the field's scalar
type, the element type for arrays (4.3), with `InvalidFilterValueError(name, op, expected)` on
failure. On a field with the `insensitive` collation, scalar values of every operator but the
patterns are lowercased and the target has `lower: true`; a pattern's target has `lower: false` and
the pattern is `ILIKE` whether or not the operator has the `i` suffix.

Tests: `operators.test.ts` (the table, classification), `condition.test.ts` (comparisons,
insensitive fields, rejections, aggregates), `condition-values.test.ts` (membership, between,
isNull, arrays), `condition-patterns.test.ts` (patterns, escaping, the `i` suffix, insensitive
fields).

### 4.3 Values (`values.ts`)

`checkScalar(type, value, values?)` accepts a value in its JSON form or in the type's canonical text
form, since query strings carry text. The result is `{ ok: true, value }` with `value` a `string`,
`number`, or `boolean` the database types by context, or `{ ok: false, expected }`.

| Type                       | Accepted                                                                                                                                             | Becomes                               | `expected`                   |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- | ---------------------------- |
| `text`                     | a string                                                                                                                                             | the string                            | `text`                       |
| `integer`, `bigint`        | a safe integer number; a bigint; a string matching `^[+-]?\d+$`                                                                                      | the number, or the digits as a string | `integer`, `bigint`          |
| `decimal`                  | a finite number; a bigint; a string matching `^[+-]?(\d+\.?\d*\|\.\d+)$`                                                                             | the number or the string              | `decimal`                    |
| `float`                    | as `decimal`, and the string form may carry an exponent                                                                                              | the number or the string              | `float`                      |
| `boolean`                  | a boolean; `'true'` or `'false'`                                                                                                                     | the boolean                           | `boolean`                    |
| `uuid`                     | the RFC 9562 text form, either case                                                                                                                  | the string                            | `uuid`                       |
| `enum`                     | one of the declared labels                                                                                                                           | the string                            | `one of "a", "b"`            |
| `date`                     | `YYYY-MM-DD` naming a real calendar day (leap years included); a valid `Date`                                                                        | the string; a `Date`'s UTC date       | `date (YYYY-MM-DD)`          |
| `time`                     | `HH:MM`, `HH:MM:SS`, `HH:MM:SS.ffffff` (up to six fraction digits)                                                                                   | the string                            | `time (HH:MM[:SS[.ffffff]])` |
| `timestamp`, `timestamptz` | `YYYY-MM-DD` then `T` or a space then a time as above, then optionally `Z` or `±HH`, `±HHMM`, `±HH:MM`, the date a real calendar day; a valid `Date` | the string; a `Date`'s ISO string     | `timestamp (ISO 8601)` etc.  |

Temporal and arbitrary-precision values stay strings so microseconds and digits survive the trip;
PostgreSQL parses them against the column's type. A list operator's `value` that is not an array is
rejected with `expected` `an array of values`; `between` with anything but two values with
`[low, high]`; `isNull` with a non-boolean with `boolean`.

Tests: `values.test.ts`.

---

## 5. Sort (`sort/resolve-sort.ts`, ADR 0008)

A sort input is `'name'` (ascending), `'-name'` (descending), or `{ field, direction }` with
`direction` `asc` or `desc`. `resolveSort(definition, input?)` resolves the request's `sort`, or the
definition's default when the request has none: every item is parsed; an item that is unknown, not
sortable, repeated, or malformed is collected, and when any was, `UnsupportedSortError(fields)`
lists all of them in request order (a malformed item by its JSON text, an object with a bad
direction by its `field`). Then every key field not already named is appended ascending, in key
order; a key field the request named keeps its place and direction. The result is total: no two rows
compare equal under it. `sortSignature(sort)` is the text a cursor is bound to: `-createdAt,id`.

Tests: `resolve-sort.test.ts`.

---

## 6. The query plan (`plan/`)

`QueryPlan` is what `plan(request)` hands an adapter. Every name in it is a validated identifier
from the definition and every value a validated request value, so an adapter renders it without
re-checking anything.

| Member            | Meaning                                                                                        |
| ----------------- | ---------------------------------------------------------------------------------------------- |
| `table`           | The definition's table                                                                         |
| `keys`            | The sort keys in order, the tie-breaker included: `{ alias, field, target, direction, nulls }` |
| `reversed`        | `true` on a backward page: the query runs inverted and `finishPage` reverses the rows          |
| `filter`          | The request's filter and search as one predicate, or `null`; what a total counts               |
| `seek`            | The cursor predicate(s), or `null` on a first page; never counted                              |
| `limit`           | `size + 1`                                                                                     |
| `size`            | The used page size                                                                             |
| `range`           | Whether both cursors were given                                                                |
| `after`, `before` | The cursors as given, or `null`                                                                |
| `sort`            | The resolved sort in the request's directions                                                  |
| `context`         | The hash cursors are bound to (8)                                                              |

A `PlanKey`'s `alias` is `keyset<index>` (`keyAlias`), `direction` is the effective direction of the
query (inverted on a backward page), and `nulls` is `last` forward and `first` on a backward page.
`CursorValue` is `string | null`: a key's value as the database returns it cast to text.

Targets: `{ kind: 'column', table, column, type, lower }` (a column, through `lower()` when
`lower`); `{ kind: 'aggregate', relation, fn, column, type }` (a scalar subquery over the relation's
rows correlated with the main table); `{ kind: 'concat', table, columns }` (the columns as one text,
nulls skipped; the `like` search source).

Predicates, with the SQL the adapter renders (10.2):

| Kind         | Members                                                   | SQL                                                                                                                    |
| ------------ | --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `and`, `or`  | `items`                                                   | the items joined; empty `and` is `true`, empty `or` is `false`                                                         |
| `not`        | `item`                                                    | `not (...)`                                                                                                            |
| `literal`    | `value`                                                   | `true` or `false`                                                                                                      |
| `compare`    | `target`, `operator`, `value`                             | `<target> <op> $n`                                                                                                     |
| `null`       | `target`, `negate`                                        | `<target> is null`, `is not null`                                                                                      |
| `in`         | `target`, `values` (never empty), `negate`                | `<target> in ($1, $2, ...)`, `not in`                                                                                  |
| `between`    | `target`, `low`, `high`                                   | `<target> between $1 and $2`                                                                                           |
| `like`       | `target` (column or concat), `pattern`, `caseInsensitive` | `<target> like $n`, `ilike`; the pattern is already escaped                                                            |
| `array`      | `target`, `operator`, `values`                            | `<column> @> $n`, `<@`, `&&`, the array as one parameter                                                               |
| `exists`     | `relation`, `predicate` (or `null`)                       | `exists (select 1 as "one" from <rel> where <rel>.<c> = <main>.<c> [and ...] [and <predicate>])`                       |
| `textSearch` | `table`, `source`, `mode`, `config`, `term`               | `to_tsvector('<config>', concat_ws(' ', ...)) @@ <mode>_to_tsquery('<config>', $n)`, or `<vector> @@ ...` for a vector |

### 6.1 The planner (`plan.ts`)

`createPlanner(definition, codec)` returns `plan(request)`; `KeysetRequest` is
`{ sort?, filter?, search?, page? }`. Validation runs in the order a client would want to hear about
problems:

1. the sort (5);
2. the filter (4);
3. the search: the term is trimmed and a blank term means no search; a term on a definition without
   `search` is `UnsupportedSearchError`; `like` search becomes a `like` predicate over the `concat`
   target with the pattern `%<escaped term>%` and `caseInsensitive` true; full-text search becomes a
   `textSearch` node. The filter and the search are joined with `and` (a single one stays as is);
4. the page (7.1);
5. the context:
   `sha256Base64Url(canonicalJson({ sort: sortSignature(sort), filter: request.filter ?? null, search: <trimmed term> }))`.
   It binds to what the request asked for, not to its spelling: `['-createdAt']` and
   `[{ field: 'createdAt', direction: 'desc' }]` share a context, and so do filters whose members
   were written in another order; a different filter value does not;
6. the cursors, `after` then `before`, decoded with the codec against the context and the number of
   sort keys (8); a rejection is `InvalidCursorError(parameter, reason)`;
7. the seek: `seekPredicate` for `after`, for `before`, both joined with `and` when both are present
   (6.2);
8. the keys: for each sort item, its alias, its target (`targetOf`), and its direction and null
   placement: the request's direction with `nulls: 'last'`, or, when `reversed` (`before` without
   `after`), the inverted direction with `nulls: 'first'`.

`limit` is `size + 1`.

Tests: `plan.test.ts`, `plan-cursors.test.ts`.

### 6.2 The seek predicate (`seek.ts`, ADR 0008)

`seekPredicate(keys, values, side)` takes the keys with the request's directions (not the inverted
ones), the cursor's value per key, and `after` or `before`, and returns "rows after (before) the
cursor" in a total order with nulls last on every key:

```
OR over i = 1..n of ( AND over j < i of equal(key_j, v_j) ) AND beyond(key_i, v_i)
```

- `equal(key, v)` is `key = v`, or `key is null` when `v` is null.
- `beyond(key, v, 'after')`: when `v` is null, `false` (nothing sorts after a null on that key);
  otherwise `key > v or key is null` on an ascending key, `key < v or key is null` on a descending
  one.
- `beyond(key, v, 'before')`: when `v` is null, `key is not null` (every value sorts before a null);
  otherwise `key < v` on an ascending key, `key > v` on a descending one.

A single key yields its `beyond` term alone. The predicate does not consult nullability; on a
non-nullable key the `is null` branch is never true.

Tests: `seek.test.ts`.

---

## 7. Pages

### 7.1 Page requests (`page/page-request.ts`, ADR 0013)

`PageInput` is `{ size?, after?, before? }`. `resolvePage(definition, input?)`:

- `after` and `before` MUST be non-empty strings when present; anything else (an empty string
  included) is `InvalidCursorError(parameter, 'malformed')`, as the profile's invalid query
  parameter rule requires.
- Both present is a range request; `RangeNotSupportedError` unless the definition's `page.range` is
  `true`.
- `size` absent: the used size is `page.default`, or `page.max` on a range request ("the server MUST
  use its max page size for that endpoint as the default page size").
- `size` present: it MUST be a positive integer (`InvalidPageSizeError(requested)`) and at most
  `page.max` (`PageSizeExceededError(requested, max)`).

Returns `{ size, after, before, range }` with absent cursors as `null`.

Tests: `page-request.test.ts`.

### 7.2 Page assembly (`page/finish.ts`)

`finishPage(plan, codec, fetched, values, options?)` takes the fetched rows (up to `plan.limit` of
them) and `values(row)`, which returns the row's sort-key values in `plan.keys` order, each a string
or `null` (a `TypeError` otherwise). It:

1. notes whether more than `plan.size` rows were fetched (`more`) and keeps the first `plan.size`;
2. reverses them when `plan.reversed`, back into request order;
3. encodes a cursor per row (8) with `plan.context`;
4. decides the links: on a range request `hasPrev` and `hasNext` are both `true`; on a backward page
   `hasNext` is `true` and `hasPrev` is `more`; otherwise `hasPrev` is whether `after` was given and
   `hasNext` is `more`;
5. sets `next` to the last row's cursor when `hasNext`, `prev` to the first row's when `hasPrev`,
   else `null`. An empty page falls back to the cursors the request came from: `next` is
   `plan.before` and `prev` is `plan.after`, since the items on either side still exist.

`Page<TRow>` is
`{ rows, cursors, next, prev, hasNext, hasPrev, size, total?, rangeTruncated?, cursor(row) }`:
`cursors` is parallel to `rows`; `total` is `options.total` as given; `rangeTruncated` is `true` on
a range request that had more rows than the size, else absent; `cursor(row)` returns the cursor of a
row of this page by identity and throws `TypeError` for any other value. A keyset's
`page(plan, rows, values, options?)` is `finishPage` with the keyset's codec.

Tests: `finish.test.ts`.

---

## 8. Cursors (`cursor/codec.ts`, ADR 0006)

A cursor is `base64url(payload) "." base64url(tag)`, no padding (2.1). The payload is the JSON
`{ v, k, c, t }`: `v` the format version (`CURSOR_VERSION`, 1), `k` the sort-key values (strings or
`null`, one per sort key), `c` the context (6.1), `t` the issue time in seconds since the epoch. The
tag is HMAC-SHA256 over the payload bytes under the current secret (2.2).

`createCursorCodec(options)` validates the options now and throws `TypeError` naming the one at
fault:

- `secret`: a string or `Uint8Array` of at least `MIN_SECRET_BYTES` (32) bytes (a string's UTF-8
  length counts), or an HMAC `CryptoKey` usable for `verify` and, for the current secret, `sign`;
- `previousSecrets`: each validated the same way (an imported key needs `verify` only);
- `ttl`: a positive integer of seconds, or absent for no expiry;
- `now`: a clock returning seconds, for tests; default the wall clock.

Keys are imported on first use and memoized. `encode(values, context)` returns the cursor.
`decode(cursor, context, length)` returns `{ ok: true, values }` or `{ ok: false, reason }`,
checking in this order and stopping at the first failure:

1. `malformed`: not exactly one `.`, either part not base64url, an empty payload, or a tag that is
   not 32 bytes;
2. `signature`: the tag verifies under neither the current secret nor any previous one;
3. `malformed`: the payload is not UTF-8 JSON of the shape above (`t` an integer, `k` an array of
   strings and nulls);
4. `version`: `v` differs from `CURSOR_VERSION`;
5. `expired`: a `ttl` is set and `t + ttl < now()`;
6. `context`: `c` differs from the request's context;
7. `malformed`: `k` does not hold `length` values.

Nothing is read from the payload before the signature verifies.

Tests: `codec.test.ts` (round trip, payload shape, foreign context, tampering and foreign secrets,
rotation, signed non-cursors, version before expiry before context, expiry, length, option
validation).

---

## 9. Errors (`errors.ts`, ADR 0010)

Every request-time error extends `KeysetError`, whose `code` is the stable discriminator and whose
`name` is the class name; `isKeysetError(value)` narrows. Messages are constant; the detail is in
fields. Definition mistakes are `TypeError`s (3.5) and are not keyset errors.

| Class                     | `code`                 | Fields                                          | When                                                                     |
| ------------------------- | ---------------------- | ----------------------------------------------- | ------------------------------------------------------------------------ |
| `InvalidCursorError`      | `INVALID_CURSOR`       | `parameter` (`after` or `before`), `reason` (8) | A cursor is missing a part, forged, foreign, outdated, expired, or empty |
| `UnsupportedSortError`    | `UNSUPPORTED_SORT`     | `fields` (every offending item, request order)  | A sort item is unknown, unsortable, repeated, or malformed (5)           |
| `UnsupportedFilterError`  | `UNSUPPORTED_FILTER`   | `field`, `operator` (or `null`)                 | An unknown field or relation path, or an operator the field rejects (4)  |
| `InvalidFilterError`      | `INVALID_FILTER`       | `path`                                          | A node that is not one of the five shapes (4.1)                          |
| `InvalidFilterValueError` | `INVALID_FILTER_VALUE` | `field`, `operator`, `expected`                 | A value the field's type rejects (4.3)                                   |
| `UnsupportedSearchError`  | `UNSUPPORTED_SEARCH`   |                                                 | A search term on a definition without `search`                           |
| `InvalidPageSizeError`    | `INVALID_PAGE_SIZE`    | `requested`                                     | `page.size` is not a positive integer (7.1)                              |
| `PageSizeExceededError`   | `PAGE_SIZE_EXCEEDED`   | `requested`, `max`                              | `page.size` above the definition's max (7.1)                             |
| `RangeNotSupportedError`  | `RANGE_NOT_SUPPORTED`  |                                                 | Both cursors on a definition without `page.range` (7.1)                  |

The profile's three error objects map to `UNSUPPORTED_SORT` (`unsupported-sort`),
`PAGE_SIZE_EXCEEDED` (`max-size-exceeded`, with `max` for `meta.page.maxSize`), and
`RANGE_NOT_SUPPORTED` (`range-pagination-not-supported`); `INVALID_CURSOR` is its invalid query
parameter error with `source.parameter` `page[after]` or `page[before]`; the rest are invalid query
parameter errors on `sort`, `filter`, or `page[size]`.

Tests: `errors.test.ts`.

---

## 10. Kysely adapter (`kysely-keyset`, `packages/kysely-keyset/src/`)

### 10.1 `createDefineKeyset<DB>()` (`define-keyset.ts`)

Returns a `DefineKeyset<DB>`: `defineKeyset` with `TypedKeysetInit<DB, TTable, TFields, TRelations>`
as its argument, which checks at compile time that `table` is a key of `DB`, every column field's
`column` is a column of that table, every relation's `table` is a table of `DB` and each `on` key a
column of it with a column of the main table as value, every aggregate's `column` a column of its
relation's table, and the search `columns` or `vector` columns of the main table. The runtime is the
core's `defineKeyset` unchanged (same validation, same definition); `RelationsOf` erases the typed
`on` to the core's `Record<string, string>`. The result is a `KyselyKeyset`: the core's `Keyset`
plus `paginate(query, request, options?)` (10.3). Column names are the interface's: under a
`CamelCasePlugin` they are camelCase, exactly as the application writes them in its own queries, and
the plugin maps the references the adapter emits (10.2).

Tests: `define-keyset.test.ts`, `define-keyset.test-d.ts`.

### 10.2 Rendering (`render/target.ts`, `render/predicate.ts`)

`renderTarget(eb, target, context)` returns a Kysely expression: a column target is
`eb.ref('<table>.<column>')`, wrapped in `lower()` when `lower`; an aggregate target is the
correlated scalar subquery
`(select <fn>(<rel>.<column>) as "value" from <rel> where <rel>.<c> = <context.table>.<c> [and ...])`,
`count(*)` for `count`; a concat target is `concat_ws(' ',
<table>.<c1>, <table>.<c2>, ...)`. `RenderContext` is `{ table }`: the main table, the correlation
side of aggregates and `exists`.

`renderPredicate(eb, node, context)` renders every predicate kind as the table in section 6 shows:
every value is a bound parameter (`in` as a parameter list; an array operand as one parameter);
`exists` selects `1 as "one"` from the relation's table correlated on every join pair, with the
inner predicate rendered in the relation's scope; `textSearch` emits the configuration as a literal
(validated at definition time, 3.4) and the term as a parameter,
`to_tsvector(config, concat_ws(' ', columns))` or the vector column on the left and
`websearch_to_tsquery`, `plainto_tsquery`, or `phraseto_tsquery` on the right. An unknown kind is a
`TypeError` (the union is closed).

Tests: `target.test.ts`, `predicate.test.ts` (exact SQL and parameters).

### 10.3 `paginate(keyset, query, request, options?)` (`paginate.ts`, ADR 0007, ADR 0012)

1. `plan = await keyset.plan(request)`.
2. The filter: `query.where(renderPredicate(plan.filter))` when there is one.
3. The total, when `options.total` is `true`: the filtered query with its selection, `order by`,
   `limit`, and `offset` cleared and `count(*) as "total"` selected, run first; the result is
   `Number(total)`, `0` without a row.
4. The page query: the seek added with `where` when there is one; `order by` and `offset` cleared;
   for each key in order, `cast(<target> as text) as "<alias>"` added to the selection and
   `order by <target> <direction> nulls <first|last>` appended; `limit plan.limit`.
5. Rows: each fetched row MUST be an object (`TypeError` otherwise); the alias members are read (a
   non-string is `null`) and removed, and the remaining members are the caller's row.
6. `keyset.page(plan, rows, values, { total })`.

`PaginateOptions` is `{ total?, onQuery? }`; `onQuery(event)` is called after each statement with
`QueryEvent` `{ kind: 'page' | 'total', sql, parameters, durationMs, rowCount }` (the statement is
compiled only when `onQuery` is set). `query` MUST be a plain selection of the definition's table as
ADR 0012 states: its `order by`, `limit`, and `offset` are replaced, its `where` is kept, and the
alias names `keyset0`, `keyset1`, ... are reserved. The SQL of a first page over `selectAll()` with
the key `id`:

```sql
select *, cast("contacts"."id" as text) as "keyset0" from "contacts"
order by "contacts"."id" asc nulls last limit $1
```

Tests: `paginate.test.ts` (exact SQL for first, filtered, counted, backward, and camelCase pages;
the base query's clauses; row splitting; the dummy driver).

---

## 11. Test plan

One Vitest run over two projects (`packages/*/vitest.config.ts`), each with `typecheck` enabled for
its `*.test-d.ts`; `kysely-keyset`'s project resolves `keyset-kit` from source (section 12). V8
coverage thresholds of 90% for statements, branches, functions, and lines over `packages/*/src/`
combined (the `index.ts` barrels excluded). Every test names the rule or choice it pins. The
adapter's tests run against a compile-only Kysely (`DummyDriver`) and a driver that answers canned
rows while recording the compiled queries; no module of the packages is mocked.

| Area                      | Files                                                                                                                                                                      | What is pinned                                                                                              |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Internal                  | `base64url.test.ts`, `crypto.test.ts`, `object.test.ts`, `canonical.test.ts`, `like.test.ts`                                                                               | RFC 4648, RFC 4231 vectors, prototype safety, RFC 8785 ordering, LIKE escaping                              |
| Definition                | `field-types.test.ts`, `normalize-fields.test.ts`, `normalize-fields.aggregate.test.ts`, `normalize-relations.test.ts`, `define-keyset.test.ts`, `define-keyset.test-d.ts` | every definition-time rejection and default, inference                                                      |
| Filter                    | `operators.test.ts`, `values.test.ts`, `condition.test.ts`, `condition-values.test.ts`, `condition-patterns.test.ts`, `normalize.test.ts`                                  | the operator table, value forms, each predicate mapping, tree shapes and paths                              |
| Sort, plan, page, cursor  | `resolve-sort.test.ts`, `plan.test.ts`, `plan-cursors.test.ts`, `seek.test.ts`, `page-request.test.ts`, `finish.test.ts`, `codec.test.ts`                                  | tie-breaking, the context, inversion, every seek case, page bounds, links, the cursor format and its checks |
| Errors                    | `errors.test.ts`                                                                                                                                                           | constant messages, structured fields, the guard                                                             |
| Adapter (`kysely-keyset`) | `target.test.ts`, `predicate.test.ts`, `paginate.test.ts`, `define-keyset.test.ts`, `define-keyset.test-d.ts`                                                              | exact SQL and parameters for every target and predicate kind and every page shape; name checks against `DB` |

### 11.1 End-to-end suite and invariants (`e2e/`)

A private workspace package that depends on `keyset-kit` and `kysely-keyset` through `workspace:*`,
so imports resolve through the published `exports` maps into each `dist/` (never the `source`
condition) and `tsc` checks the emitted declarations. `e2e/support/` holds the schema (three tables:
`contacts` with every field type and a generated `tsvector`, `contact_emails`, `work_history`) and a
twelve-row seed with the cases keyset pagination must survive: equal sort values, nulls in sortable
columns, mixed-case text, a microsecond timestamp, enums, arrays, and relations with zero, one, or
several rows. `expectedIds(sort)` orders the seed in JavaScript (nulls last, the key breaking ties),
so no test trusts the SQL under test for its expectation.

`runInvariants(label, open)` runs, for eight sorts (single and composite, ascending and descending,
over ties, nulls, an insensitive column, and both aggregates) and page sizes 1, 3, and 5: walking
forward from the first page visits every row once in the expected order with `prev` null only on the
first page; walking backward from the last page visits the same rows in the same order; every row's
own cursor resumes right after it (and right before it); and `next` then `prev` returns to the page
it came from.

| File                          | Covers                                                                                                               |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `package-surface.e2e.test.ts` | the exact export lists of both packages, and that `kysely-keyset` re-exports the core's own bindings                 |
| `paginate.e2e.test.ts`        | the invariants on PGlite; defaults, alias stripping, totals, `onQuery`, a composite key through equal timestamps     |
| `filters.e2e.test.ts`         | every operator of every type against real rows, combinators, rejections before querying, totals                      |
| `relations.e2e.test.ts`       | relation paths, `some`, negation, aggregate sorts with nulls in both directions, aggregate filters, aggregate paging |
| `search.e2e.test.ts`          | `like` search, websearch over the stored vector (words, negation, phrases), phrase search over columns, rejection    |
| `range.e2e.test.ts`           | the rows between two cursors, the max size default, `rangeTruncated`, empty ranges, rejection                        |
| `cursors.e2e.test.ts`         | foreign context, tampering, foreign secrets, malformed input, expiry, rotation, opacity and URL safety               |
| `camel-case.e2e.test.ts`      | a `CamelCasePlugin` application end to end, and cursor interchange with the snake_case definition                    |
| `pg-driver.e2e.test.ts`       | section 11.2                                                                                                         |
| `postgres.e2e.test.ts`        | section 11.3                                                                                                         |

### 11.2 node-postgres (`pg-driver.e2e.test.ts`)

The invariants over the stock `pg` driver and its type parsers, speaking the wire protocol to a
PGlite socket server (`@electric-sql/pglite-socket`). The key values cast to text through the driver
decode to the same values as through PGlite's in-process dialect, so cursors issued through either
are interchangeable (the `timestamptz` text carries the session's time zone, so the test compares
instants), and the caller's own columns keep the driver's parsing (`Date`, numeric strings, arrays).

### 11.3 A PostgreSQL server (`postgres.e2e.test.ts`)

The invariants, filters, relations, search, and range requests on the planner and executor
production uses. The file runs only when `KEYSET_PG_URL` names a server and skips itself otherwise;
it creates a throwaway schema, scopes its connections to it with `search_path`, and drops it. CI
provides PostgreSQL 14 and 18.

### 11.4 Runtime smoke test (`e2e/smoke/`)

`checks.ts` holds runtime-neutral checks over the built packages: define a keyset, plan a request,
sign and verify cursors with the runtime's Web Crypto, render SQL through Kysely's PostgreSQL
compiler over `DummyDriver`, and get the typed errors. `run.ts` drives it in-process on Bun and
Deno; `worker.ts` is the Workers module and `workerd.ts` bundles it with tsdown
(`platform: 'neutral'`) and runs it in Miniflare's workerd. `pnpm test:runtimes` runs all three; CI
runs them on every push.

---

## 12. Packaging

- ESM only, `engines.node >= 22.12.0`, built by tsdown with `platform: 'neutral'` and declarations
  through oxc (`isolatedDeclarations`, ADR 0003). `publint --strict` and `attw --profile esm-only`
  run in the build and in `check:pkg`.
- Each package's `exports` map has one entry (`.`) plus `./package.json`. In the repository the
  entry carries a `source` condition pointing at `src/index.ts` (tsdown `devExports`), enabled only
  by `packages/kysely-keyset/tsconfig.json` (`customConditions`) and its Vitest project
  (`ssr.resolve.conditions`); `publishConfig.exports` is the dist-only map `pnpm publish` and
  `pnpm pack` apply. CI fails when the build changes the committed maps.
- `keyset-kit` has no dependencies. `kysely-keyset` depends on `keyset-kit` (`workspace:^`, written
  as a caret range on publish) and has `kysely >= 0.28.0` as its only peer dependency; CI runs its
  unit tests on 0.28.17.
- `files` is `dist`, `CHANGELOG.md`, `LICENSE`, `README.md`. `sideEffects: false`.
- Releases go through Changesets: a "Version Packages" PR, then `changeset publish` under npm
  trusted publishing with provenance, one GitHub release per package.

---

## 13. Constants

| Name                    | Value                                                       | Exported |
| ----------------------- | ----------------------------------------------------------- | -------- |
| `CURSOR_VERSION`        | 1                                                           | yes      |
| `MIN_SECRET_BYTES`      | 32                                                          | yes      |
| `DEFAULT_PAGE_SIZE`     | 20                                                          | yes      |
| `DEFAULT_MAX_PAGE_SIZE` | 100                                                         | yes      |
| `OPERATORS`             | the nineteen operators of 4.2, in table order               | yes      |
| `keyAlias(i)`           | `keyset<i>`                                                 | yes      |
| `PROTO_KEYS`            | `__proto__`, `constructor`, `prototype`                     | no       |
| name grammar            | `^[A-Za-z0-9][A-Za-z0-9_-]*$` (field and relation names)    | no       |
| `SEARCH_CONFIG`         | `^[a-z_][a-z0-9_]{0,62}$` (text search configuration names) | no       |
| `TAG_BYTES`             | 32 (the HMAC-SHA256 tag)                                    | no       |
