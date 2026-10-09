# keyset-kit

Keyset pagination for any JavaScript runtime, database-free. Declare once what a collection can
sort, filter, and search on; get a typed request, validation that rejects what the definition did
not declare, a query plan any adapter can render, HMAC-signed cursors bound to the request, and page
assembly with the semantics of the JSON:API
[Cursor Pagination profile](https://jsonapi.org/profiles/ethanresnick/cursor-pagination/). Every
rule is a cited clause of the profile or the PostgreSQL manual; where a choice is the library's, it
is written down in [`docs/SPEC.md`](https://github.com/ali-issa/keyset-kit/blob/main/docs/SPEC.md).

Using [Kysely](https://kysely.dev)? [`kysely-keyset`](https://www.npmjs.com/package/kysely-keyset)
renders the plan onto your select query and runs it, checks every name against your `DB` interface,
and re-exports all of this package.

## Install

```bash
pnpm add keyset-kit
```

No dependencies. Node 22.12+, Bun, Deno, and Cloudflare Workers are supported; the package uses web
standards only (Web Crypto, `btoa`, `TextEncoder`) and never reads the environment. The plan's
vocabulary is PostgreSQL's (`ILIKE`, array operators, `tsvector`, `NULLS FIRST` and `LAST`).

## Quick start

Three calls: define, plan, page. You run the query in between, with whatever builds your SQL.

```ts
import { defineKeyset } from 'keyset-kit';

const contacts = defineKeyset({
  table: 'contacts',
  key: ['id'],
  fields: {
    id: { column: 'id', type: 'uuid' },
    name: { column: 'name', type: 'text', collation: 'insensitive' },
    age: { column: 'age', type: 'integer', nullable: true },
    createdAt: { column: 'created_at', type: 'timestamptz' },
  },
  sort: { default: ['-createdAt'] },
  page: { default: 20, max: 100 },
  cursor: { secret: env.CURSOR_SECRET }, // at least 32 bytes
});

const plan = await contacts.plan({
  sort: ['-createdAt'],
  filter: { field: 'age', op: 'gte', value: 18 },
  page: { size: 25, after: query.page.after },
});

const rows = await render(plan); // your adapter: see "The plan"
const page = await contacts.page(plan, rows, (row) => [row.keyset0, row.keyset1]);

page.rows; // 25 rows at most, in request order
page.next; // the cursor of the next page, or null
page.prev; // the cursor of the previous page, or null
```

A request that sorts on an undeclared field, filters with an operator the type does not accept, asks
for more than `max` rows, or sends a cursor issued for another sort is rejected by `plan` before any
query runs, with a typed error (see Errors).

### Define a keyset

The definition is the single source: the fields and their types, the relations, the aggregates, the
search, the key, the default sort, the page bounds, and the cursor secret. Everything else reads
from it, and a mistake in it throws a `TypeError` naming the option at startup rather than failing a
request later.

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
    bio: { column: 'bio', type: 'text', sortable: false, operators: ['containsi'] },
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
  cursor: { secret: env.CURSOR_SECRET, previousSecrets: [env.OLD_CURSOR_SECRET], ttl: 86_400 },
});
```

- **Fields** are the request's vocabulary; `column` is the database's. The twelve scalar types are
  `text`, `integer`, `bigint`, `decimal`, `float`, `boolean`, `uuid`, `enum` (with `values`),
  `date`, `time`, `timestamp`, `timestamptz`; `array` takes an element type in `of`. `nullable`
  (default `false`) enables `isNull`; `sortable` (default `true`; always `false` for arrays) keeps a
  field out of `sort`; `operators` narrows the operators the type allows; `collation: 'insensitive'`
  on `text` compares, matches, and sorts through `lower()`.
- **Aggregates** are values over a relation's rows: `count`, or `max`, `min`, `sum`, `avg` of a
  column, with the type the function produces. They sort and filter like any other field, with the
  key breaking their ties.
- **Relations** join a related table on column pairs (`on: { related: main }`) and declare their own
  filterable fields, reachable as `emails.email` or inside `{ relation: 'emails', some }`.
- **Search** is `{ mode: 'like', columns }` for `ILIKE '%term%'` over the columns, or full-text
  search over `columns` (`to_tsvector` at query time) or a `vector` column, with `mode` `websearch`
  (default), `plain`, or `phrase`, and a `config` name (default `simple`).
- **The key** names fields that identify a row: declared, sortable, non-nullable columns. It is
  appended to every sort, so the order is total and cursors mark one position.
- **Page** bounds: `default` (20), `max` (100), and whether `range` requests (`after` with `before`)
  are allowed (off by default).
- **Cursor**: the HMAC secret (a string or bytes of at least 32 bytes, or an imported HMAC
  `CryptoKey`), the previous secrets still accepted during a rotation, and an optional `ttl` in
  seconds.

The literal types flow into the result: `sort` accepts only sortable field names, `filter` only
declared fields and `relation.field` paths, and `{ relation, some }` only the relation's fields.

### The request

```ts
const page = await contacts.plan({
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
      { not: { field: 'latestStart', op: 'lt', value: '2020-01-01' } },
    ],
  },
  search: 'lovelace -ada',
  page: { size: 50, after: cursor },
});
```

`sort` is a list of `'field'`, `'-field'`, or `{ field, direction }`; the key is appended when not
named. `filter` is a tree of conditions, `and`, `or`, `not`, and `{ relation, some }`; an API layer
builds it from its own grammar (jsonapi-kit's parsed conditions map one to one). Values arrive as
JSON or as the type's text form, because query strings carry text: `'18'`, `'true'`, and
`'2024-01-31'` are accepted for an integer, a boolean, and a date. `search` is a term; blank means
none. `page` carries `size`, `after`, and `before`.

The operators by type:

| Type                                                                                | Operators                                                                                                                                          |
| ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `text`                                                                              | `eq`, `ne`, `in`, `nin`, `gt`, `gte`, `lt`, `lte`, `between`, `contains`, `startsWith`, `endsWith`, `eqi`, `containsi`, `startsWithi`, `endsWithi` |
| `integer`, `bigint`, `decimal`, `float`, `date`, `time`, `timestamp`, `timestamptz` | `eq`, `ne`, `in`, `nin`, `gt`, `gte`, `lt`, `lte`, `between`                                                                                       |
| `uuid`, `enum`                                                                      | `eq`, `ne`, `in`, `nin`                                                                                                                            |
| `boolean`                                                                           | `eq`, `ne`                                                                                                                                         |
| `array`                                                                             | `contains`, `containedBy`, `overlaps`                                                                                                              |
| any nullable field                                                                  | `isNull` (value `true` by default, `false` for `IS NOT NULL`)                                                                                      |

The pattern operators match `%v%`, `v%`, `%v`, and `v` with `%`, `_`, and `\` in the value escaped;
the `i` forms are `ILIKE`, and on an `insensitive` field every pattern is. `between` takes
`[low, high]`; `in` and `nin` take an array, and an empty one matches nothing (everything for
`nin`).

### The plan

`plan(request)` validates the request (sort, filter, search, page size, then cursors) and returns a
`QueryPlan` an adapter renders without re-checking anything: every name in it is a validated
identifier from the definition and every value a validated request value.

```ts
plan.keys; // [{ alias: 'keyset0', field: 'emailCount', target, direction: 'desc', nulls: 'last' }, ...]
plan.filter; // the filter and the search as one predicate tree, or null
plan.seek; // the cursor's predicate tree, or null on a first page
plan.limit; // size + 1: one extra row tells whether a next page exists
plan.reversed; // true on a page before a cursor: run inverted, then reverse the rows
plan.context; // the hash cursors are bound to
```

An adapter adds the filter and the seek to `where`, selects each key cast to text under its alias
(`cast(created_at as text) as keyset0`), orders by the keys with the stated direction and null
placement, limits, and hands the rows to `page` with a function that reads the aliases back. The
predicate tree has thirteen kinds (`and`, `or`, `not`, `literal`, `compare`, `null`, `in`,
`between`, `like`, `array`, `exists`, `textSearch`) over three targets (a column, an aggregate
subquery, a concatenation);
[`docs/SPEC.md`](https://github.com/ali-issa/keyset-kit/blob/main/docs/SPEC.md) section 6 lists each
with its SQL, and
[`kysely-keyset`](https://github.com/ali-issa/keyset-kit/tree/main/packages/kysely-keyset) is the
reference rendering in under two hundred lines.

Why text? A cursor must round-trip a value exactly, and drivers parse values for convenience, not
exactness (a `timestamptz` becomes a millisecond `Date`, a `numeric` a string or a number). The
cursor stores the database's own text form and the seek binds it back as a parameter, which
PostgreSQL casts by context, so the comparison is exact whatever the driver does to the caller's
columns.

### The page

`page(plan, rows, values, options?)` takes the fetched rows (up to `limit`), reverses a backward
page back into request order, signs a cursor per row, and decides the links:

```ts
const page = await contacts.page(plan, rows, (row) => [row.keyset0, row.keyset1], { total });

page.rows; // Array<Row>, at most `size`, in request order
page.cursors; // one cursor per row, parallel to rows
page.cursor(row); // the cursor of a row of this page
page.next; // page[after] for the next page; null when there is none
page.prev; // page[before] for the previous page; null when there is none
page.hasNext; // boolean
page.hasPrev; // boolean
page.size; // the used page size
page.total; // whatever you passed in options
page.rangeTruncated; // true on a range request that had more rows than the size
```

As the profile requires, a first page has `prev: null`, a page after a cursor links back, a range
request (`after` with `before`) always links both ways and uses the max page size unless the request
names one, and an empty page still points at the cursors it came from.

### Cursors

A cursor is `base64url(payload).base64url(tag)`: the payload holds the format version, the sort-key
values, the request context, and the issue time; the tag is HMAC-SHA256 over the payload under your
secret. Decoding verifies the tag before reading anything, then checks the version, the expiry, and
the context. A cursor issued under one sort, filter, or search is rejected under another, so its
values are only ever compared against the columns they were read from.

```ts
cursor: {
  secret: env.CURSOR_SECRET,                 // >= 32 bytes; a string, Uint8Array, or HMAC CryptoKey
  previousSecrets: [env.OLD_CURSOR_SECRET],  // still verify during a rotation
  ttl: 86_400,                               // seconds; omit for cursors that never expire
}
```

Best practices:

- **Generate the secret, do not type it.** 32 random bytes from your secret manager
  (`openssl rand -base64 32`), one per deployment environment. Never a password, never shared with
  another signing use.
- **Rotate without downtime.** Add the current secret to `previousSecrets`, set the new one, deploy;
  remove the old one once every cursor it signed is older than you care about (the `ttl`, or your
  clients' longest session).
- **Set a `ttl` when cursors leave your control**: emailed links, stored searches. Pagination inside
  a session rarely needs one.
- **A cursor is signed, not encrypted.** Anyone holding it can read the sort-key values of the row
  it points at. Do not offer a sort over a column the client must not learn.
- **Share one secret across the keysets of one API** so a cursor from one endpoint is never accepted
  by another by accident: the context already binds it to its sort, filter, and search, and the
  secret binds it to your service.

`createCursorCodec(options)` is exported for callers who want to inspect or issue cursors outside a
keyset; `decode(cursor, context, length)` never throws and reports why a cursor was rejected
(`malformed`, `signature`, `version`, `expired`, `context`).

### Errors

Every request-time error is a `KeysetError` with a stable `code` and the detail in fields; the
message is constant, so nothing from the request leaks through a log or a response. Definition
mistakes are `TypeError`s thrown by `defineKeyset`.

| `code`                 | Fields                          | When                                                         |
| ---------------------- | ------------------------------- | ------------------------------------------------------------ |
| `INVALID_CURSOR`       | `parameter`, `reason`           | a cursor is malformed, forged, foreign, outdated, or expired |
| `UNSUPPORTED_SORT`     | `fields`                        | a sort item is unknown, unsortable, repeated, or malformed   |
| `UNSUPPORTED_FILTER`   | `field`, `operator`             | an unknown field or path, or an operator the field rejects   |
| `INVALID_FILTER`       | `path`                          | a filter node that is not one of the five shapes             |
| `INVALID_FILTER_VALUE` | `field`, `operator`, `expected` | a value the field's type rejects                             |
| `UNSUPPORTED_SEARCH`   |                                 | a search term on a definition without `search`               |
| `INVALID_PAGE_SIZE`    | `requested`                     | `page.size` is not a positive integer                        |
| `PAGE_SIZE_EXCEEDED`   | `requested`, `max`              | `page.size` above the definition's `max`                     |
| `RANGE_NOT_SUPPORTED`  |                                 | both cursors on a definition without `page.range`            |

They map onto the profile's error objects: `UNSUPPORTED_SORT` is `unsupported-sort`,
`PAGE_SIZE_EXCEEDED` is `max-size-exceeded` (with `max` for `meta.page.maxSize`),
`RANGE_NOT_SUPPORTED` is `range-pagination-not-supported`, and the rest are invalid query parameter
errors with `source.parameter` `sort`, `filter`, `page[size]`, `page[after]`, or `page[before]`.

```ts
try {
  return await contacts.page(plan, rows, values);
} catch (error) {
  if (isKeysetError(error)) {
    return badRequest(error.code, error); // map code and fields to your error catalog
  }
  throw error;
}
```

## Documentation

- [`docs/DESIGN.md`](https://github.com/ali-issa/keyset-kit/blob/main/docs/DESIGN.md): what the
  packages are, the principles, and the API by example
- [`docs/SPEC.md`](https://github.com/ali-issa/keyset-kit/blob/main/docs/SPEC.md): the normative
  contract, section by section, with the tests that prove it
- [`docs/adr/`](https://github.com/ali-issa/keyset-kit/tree/main/docs/adr): the decisions, including
  every choice the profile leaves to the server

## License

MIT
