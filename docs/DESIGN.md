# keyset-kit: design

This document describes what keyset-kit and kysely-keyset are, the API they expose, and how they are
built.

Architecture decisions referenced as ADR-NNNN live in `docs/adr/`. The normative, clause-by-clause
specification that implementers work from is `docs/SPEC.md`; this document explains the intent
behind it. When the two disagree, fix one in the same PR.

## 1. Purpose

keyset-kit is the pagination layer between an API and a PostgreSQL database: a database-free core
(`keyset-kit`) and a Kysely adapter (`kysely-keyset`) that re-exports it and adds the SQL
(ADR-0004). They give an application:

1. one definition per collection, from which the request type, the validation, the seek predicate,
   the cursors, and the SQL all derive, so a client cannot sort, filter, or search on anything the
   definition did not declare, and a cursor cannot mean something other than what it was issued for;
2. keyset pagination that is correct in the cases offset pagination and naive cursors get wrong:
   equal sort values, `NULL`s in sort columns, backward pages, microsecond timestamps, sorts over
   aggregates of related rows;
3. cursors a client can hold but not forge, reuse under another request, or keep forever: signed
   with HMAC-SHA256, bound to the sort, filter, and search, versioned, with optional expiry and
   secret rotation (ADR-0006);
4. the page semantics of the JSON:API
   [Cursor Pagination profile](https://jsonapi.org/profiles/ethanresnick/cursor-pagination/):
   `page[size]`, `page[after]`, `page[before]`, `prev` and `next` that are `null` when there is no
   page, range requests with `rangeTruncated`, and errors a JSON:API layer maps to the profile's
   error objects.

It is a library for teams who paginate large tables and want the hard cases handled once.

### Who it is for

- Teams on Kysely and PostgreSQL who want `paginate(query, request)` to be the whole story.
- Teams on another query builder, a raw driver, or a client who want the planning, the cursors, and
  the page semantics without the SQL: the core hands them a plan to render.
- Teams serving JSON:API who want the one published cursor profile, end to end: `jsonapi-kit` parses
  the query and builds the document, keyset-kit runs the page in between.

### Non-goals

- Parsing URLs or query strings. The request is data (`sort`, `filter`, `search`, `page`); an API
  layer builds it from whatever grammar it speaks.
- HTTP. No status codes, no error documents; the errors are typed classes an API layer maps
  (ADR-0010).
- Databases other than PostgreSQL (ADR-0009). The predicate vocabulary is PostgreSQL's; another
  database is another adapter and an ADR.
- Offset pagination, `last` links, or page numbers.
- Encrypting cursors. They are signed, so they cannot be forged or altered; what they contain (the
  sort-key values of one row) is readable.
- Supporting CommonJS-only consumers or Node older than 22.12 (ADR-0003).

## 2. Principles

1. **The definition is the single source.** `defineKeyset` validates it once, at startup, with a
   `TypeError` naming the option (ADR-0011). The planner, the cursor codec, and the adapter read
   from it; nothing is declared twice.
2. **Spec-driven.** The profile fixes the page semantics; PostgreSQL's documentation fixes ordering,
   pattern matching, arrays, and text search; RFCs fix HMAC, base64url, and canonical JSON. Each
   behavior is a cited clause, and the test names the rule. Where a choice is the library's, it is
   an ADR (ADR-0005 to ADR-0009, ADR-0012, ADR-0013).
3. **Every identifier from the definition, every value a parameter.** No request data reaches SQL
   except as a bound parameter. The one literal, the text search configuration, is validated against
   `regconfig`'s name syntax at definition time.
4. **A cursor is a signed claim, checked before it is read.** Verify, then parse; then version,
   expiry, context. A cursor issued for one sort, filter, or search is rejected under another, so
   the values in it can never be compared against columns they were not read from.
5. **The order is total.** The key is appended to every sort, `NULL`s have a fixed place, and the
   seek predicate is built so that walking forward and backward visits the same rows in the same
   order (ADR-0008). The e2e suite proves it over sorts with ties and nulls on three databases.
6. **Report, never drop.** An unknown sort field, an operator the field does not accept, a bad
   value, a malformed filter node, a cursor from another request: each is a typed error with the
   detail in a field. Nothing is ignored.
7. **Nothing about the data reaches a message.** Error messages are constant; the request's values
   go in structured fields the API layer decides what to do with.
8. **Web standards only. No ambient environment.** Web Crypto, `btoa`, `TextEncoder`; nothing reads
   `process` (ADR-0002). The same code runs on Node, Bun, Deno, and workerd.
9. **Client input is hostile.** Field, relation, and operator names are looked up in `ReadonlyMap`s
   or after a prototype-key check; never in a plain object by the request's key.
10. **Every non-obvious decision cites its source** with `@ref` in code and an ADR in docs.

## 3. The API by example

The examples use `kysely-keyset`. `createDefineKeyset`, `paginate`, and the render functions are the
adapter's; everything else is `keyset-kit`'s, and the core README shows the same flow without
Kysely.

### 3.1 Minimal

```ts
export const defineKeyset = createDefineKeyset<DB>();

export const contacts = defineKeyset({
  table: 'contacts',
  key: ['id'],
  fields: {
    id: { column: 'id', type: 'uuid' },
    name: { column: 'name', type: 'text' },
    createdAt: { column: 'created_at', type: 'timestamptz' },
  },
  cursor: { secret: env.CURSOR_SECRET },
});

const page = await contacts.paginate(db.selectFrom('contacts').selectAll(), {
  sort: ['-createdAt'],
  page: { size: 25, after: query.page.after },
});
```

One definition, one call. `page.rows` is the selection as Kysely typed it; `page.next` and
`page.prev` are the cursors for the neighbouring pages or `null`; `page.cursor(row)` is the cursor
that falls on a row.

### 3.2 The definition

```ts
const contacts = defineKeyset({
  table: 'contacts',
  key: ['id'],
  fields: {
    id: { column: 'id', type: 'uuid' },
    lastName: { column: 'last_name', type: 'text', collation: 'insensitive', nullable: true },
    age: { column: 'age', type: 'integer', nullable: true },
    status: { column: 'status', type: 'enum', values: ['lead', 'customer'] },
    tags: { column: 'tags', type: 'array', of: 'text' },
    createdAt: { column: 'created_at', type: 'timestamptz' },
    bio: { column: 'bio', type: 'text', sortable: false, operators: ['contains', 'containsi'] },
    emailCount: { aggregate: { relation: 'emails', fn: 'count' }, type: 'bigint' },
    latestStart: {
      aggregate: { relation: 'workHistory', fn: 'max', column: 'start_date' },
      type: 'date',
    },
  },
  relations: {
    emails: {
      table: 'contact_emails',
      on: { contact_id: 'id' },
      fields: { email: { column: 'email', type: 'text' } },
    },
    workHistory: { table: 'work_history', on: { contact_id: 'id' } },
  },
  search: { vector: 'search_vector', config: 'english' },
  sort: { default: ['-createdAt'] },
  page: { default: 20, max: 100, range: true },
  cursor: { secret: env.CURSOR_SECRET, previousSecrets: [env.PREVIOUS_CURSOR_SECRET], ttl: 86_400 },
});
```

Field names are the request's vocabulary; columns are the database's. A field's type fixes which
operators it accepts and how values are checked (SPEC 4.2, 4.3); `sortable: false` keeps it out of
`sort`; `operators` narrows further. Aggregates are values computed over a relation's rows and sort
and filter like any other field. Relations declare their own fields, reachable as `emails.email` in
a condition or inside `{ relation: 'emails', some: ... }`. The literal types flow into the result:
`sort` accepts only sortable field names, `filter` only declared fields and relation paths, and with
`createDefineKeyset<DB>()` every table and column name is checked against the Kysely interface.

### 3.3 The request

```ts
const request: KeysetRequestOf<typeof contacts> = {
  sort: ['-emailCount', 'lastName'],
  filter: {
    and: [
      { field: 'status', op: 'eq', value: 'customer' },
      { field: 'tags', op: 'overlaps', value: ['ops', 'sec'] },
      {
        or: [
          { field: 'age', op: 'gte', value: 30 },
          { field: 'age', op: 'isNull' },
        ],
      },
      { relation: 'emails', some: { field: 'email', op: 'endsWithi', value: '@EXAMPLE.COM' } },
    ],
  },
  search: 'lovelace -ada',
  page: { size: 50, after: cursor },
};
```

The filter is a tree, not a grammar (ADR-0005): an API layer builds it from its own syntax
(`jsonapi-kit`'s parsed conditions map one to one). Values arrive as JSON or as the type's text
form, because query strings carry text; a value the type does not accept is an
`InvalidFilterValueError` naming the field, the operator, and what was expected.

### 3.4 The plan

```ts
const plan = await contacts.plan(request);
// plan.keys    [{ alias: 'keyset0', field: 'emailCount', target: {...}, direction: 'desc', nulls: 'last' }, ...]
// plan.filter  the filter and the search as one predicate tree
// plan.seek    the cursor's predicate tree, or null on a first page
// plan.limit   51: one more than the page size
// plan.context the hash cursors are bound to
```

An adapter renders `plan.filter` and `plan.seek` (thirteen predicate kinds over three target kinds,
SPEC 6), selects each key cast to text under its alias, orders by the keys with the stated null
placement, and limits. The planner validated everything: an adapter renders without re-checking.

### 3.5 The page

```ts
const page = await contacts.page(plan, rows, (row) => [row.keyset0, row.keyset1]);
```

`finishPage` takes the fetched rows (one more than the page size, to know whether a next page
exists), reverses a backward page back into request order, signs a cursor per row, and decides
`prev` and `next`. An empty page still links back to the cursors it came from, as the profile
requires. `kysely-keyset`'s `paginate` does 3.4 and 3.5 in one call.

### 3.6 Errors to HTTP

```ts
try {
  return await contacts.paginate(query, request);
} catch (error) {
  if (!isKeysetError(error)) throw error;
  switch (error.code) {
    case 'UNSUPPORTED_SORT':
      throw jsonApiError(error.fields.map((field) => unsupportedSortError(field)));
    case 'PAGE_SIZE_EXCEEDED':
      throw jsonApiError(maxPageSizeExceededError(error.requested, error.max));
    case 'RANGE_NOT_SUPPORTED':
      throw jsonApiError(rangePaginationNotSupportedError());
    case 'INVALID_CURSOR':
      throw invalidCursor(`page[${error.parameter}]`);
    default:
      throw badRequest(error.code, error);
  }
}
```

Every request-time error is a `KeysetError` with a stable `code` and the detail in fields
(ADR-0010). The example maps them to `jsonapi-kit`'s profile errors; any API layer does the same
with its own catalog.

## 4. Architecture

### 4.1 Modules

```
keyset-kit (packages/keyset-kit/src)
  internal     base64url, Web Crypto, prototype-safe objects, canonical JSON, LIKE escaping
  definition   defineKeyset: vocabularies, field and relation validation, the definition
  filter       the tree, the operator table, value checks, condition and tree normalization
  sort         sort resolution with the key appended; the sort signature
  plan         the plan types, the planner, the seek predicate
  page         page request resolution, page assembly
  cursor       the codec: sign, verify, rotate, expire, bind to context
  errors       the request-time error classes
kysely-keyset (packages/kysely-keyset/src)
  define-keyset   createDefineKeyset<DB>(): names checked against DB, keysets with paginate
  paginate        the plan onto a select query: filter, total, seek, keys, order, limit
  render          targets and predicates as Kysely expressions
```

Imports form a DAG from `internal` outward. Nothing in `keyset-kit` imports a database library; it
has no dependencies. `kysely-keyset` imports `keyset-kit` and `kysely` and re-exports the core so
applications see one package (ADR-0004). `import/no-cycle` is enforced.

### 4.2 Data flow for a page

```
request ──plan()──▶ resolveSort ▶ normalizeFilter ▶ search ▶ resolvePage ▶ context
                    decode cursors (verify, version, expiry, context) ▶ seekPredicate ▶ keys
        ──paginate()──▶ where(filter) ▶ [count(*) as total] ▶ where(seek)
                        ▶ select cast(key as text) as keysetN ▶ order by keys nulls last|first
                        ▶ limit size + 1 ▶ execute ▶ split aliases from rows
        ──page()──▶ reverse a backward page ▶ sign a cursor per row ▶ prev, next, total, rangeTruncated
```

### 4.3 Null ordering and backward pages

PostgreSQL sorts `NULL` last on `ASC` and first on `DESC` by default; a seek over a nullable key
needs one fixed rule. Every key is ordered `NULLS LAST` in the request's direction. A page before a
cursor runs the query inverted (`ASC` becomes `DESC`, `NULLS LAST` becomes `NULLS FIRST`), so the
rows closest to the cursor come first and `limit` cuts the right end; `finishPage` reverses them
back. The seek predicate is a disjunction of prefix-equality conjunctions whose last term knows what
lies beyond a value or a null in each direction (SPEC 6.2). The e2e invariants walk eight sorts,
with ties and nulls, forward and backward on PGlite, node-postgres, and a PostgreSQL server, and
check that each walk visits every row once in the expected order.

### 4.4 Cursor values

Sort-key values travel as text: `paginate` selects `cast(<key> as text) as "keysetN"` beside the
caller's columns, the cursor stores that text, and the seek binds it as a parameter that PostgreSQL
casts back to the column's type (ADR-0007). A `timestamptz` keeps its microseconds, a `numeric` its
digits, and the caller's own columns keep whatever the driver parses them into. The text form of a
`timestamptz` carries the session's time zone, so the same instant produces different text under
different `TimeZone` settings; the comparison is exact either way, and an application that wants
identical cursors across sessions fixes the zone on its connections.

### 4.5 Types

Two type parameters ride on `Keyset`: the fields and the relations, as declared (`const` type
parameters keep the literals). From them derive the request type (`KeysetRequestOf`): sortable field
names, filterable field names and relation paths, and the relation filters. The adapter adds the
database: `createDefineKeyset<DB>()` returns a definer whose `TypedKeysetInit` checks `table`, every
`column`, every relation `table` and `on` pair, aggregate columns, and search columns against `DB`;
`paginate` is generic over the caller's query, so `Page<TRow>` is the selection's row type.

## 5. Decisions

| ADR  | Decision                                                                                 |
| ---- | ---------------------------------------------------------------------------------------- |
| 0001 | Record architecture decisions                                                            |
| 0002 | Web standards only; no ambient environment reads                                         |
| 0003 | ESM only, TypeScript 7 `isolatedDeclarations`, erasable syntax                           |
| 0004 | Two packages: the database-free core `keyset-kit` and the Kysely adapter `kysely-keyset` |
| 0005 | The filter is a typed tree with a per-type operator table                                |
| 0006 | Cursors: HMAC-signed, versioned, bound to the request context, with expiry and rotation  |
| 0007 | Sort-key values travel as text under private aliases                                     |
| 0008 | The key is a mandatory tie-breaker; `NULLS LAST` forward, inverted on backward pages     |
| 0009 | PostgreSQL first                                                                         |
| 0010 | Typed error classes with constant messages; no ban-kit dependency                        |
| 0011 | Definitions are validated at definition time, never at request time                      |
| 0012 | Totals are an opt-in second query; the base query must be a plain selection              |
| 0013 | Page size bounds, defaults, and range requests                                           |
