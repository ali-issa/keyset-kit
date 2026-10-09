# kysely-keyset

Keyset pagination for [Kysely](https://kysely.dev) on PostgreSQL. Declare once what a collection can
sort, filter, and search on, checked against your `DB` interface; then `paginate` any select query
of that table and get a page with cursors that survive ties, nulls, backward walks, and microsecond
timestamps. The page semantics are those of the JSON:API
[Cursor Pagination profile](https://jsonapi.org/profiles/ethanresnick/cursor-pagination/); every
rule is a cited clause of the profile or the PostgreSQL manual, and every choice the profile leaves
open is written down in
[`docs/SPEC.md`](https://github.com/ali-issa/keyset-kit/blob/main/docs/SPEC.md).

This is the Kysely adapter of [`keyset-kit`](https://www.npmjs.com/package/keyset-kit), the
database-free core. Everything the core exports is re-exported here, so an application imports from
one package; what this package adds is `createDefineKeyset<DB>()`, `paginate`, and the two render
functions that turn the core's plan into Kysely expressions.

## Install

```bash
pnpm add kysely-keyset kysely
```

`kysely >= 0.28` is the peer dependency; the adapter targets PostgreSQL 14+ and PGlite through any
Kysely PostgreSQL dialect (`PostgresDialect` over `pg`, `PGliteDialect`, or your own). Node 22.12+,
Bun, Deno, and Cloudflare Workers are supported. CI runs the unit tests on Kysely 0.28 and 0.29, the
end-to-end suite on PGlite, on node-postgres, and on PostgreSQL 14 and 18 servers, and a smoke test
on Bun, Deno, and workerd.

## Quick start

```ts
import { createDefineKeyset } from 'kysely-keyset';

import type { DB } from './db'; // your Kysely database interface

// keysets/define.ts: one definer for the whole application.
export const defineKeyset = createDefineKeyset<DB>();

export const contacts = defineKeyset({
  table: 'contacts',
  key: ['id'],
  fields: {
    id: { column: 'id', type: 'uuid' },
    name: { column: 'name', type: 'text', collation: 'insensitive' },
    age: { column: 'age', type: 'integer', nullable: true },
    status: { column: 'status', type: 'enum', values: ['lead', 'customer'] },
    createdAt: { column: 'created_at', type: 'timestamptz' },
    emailCount: { aggregate: { relation: 'emails', fn: 'count' }, type: 'bigint' },
  },
  relations: {
    emails: {
      table: 'contact_emails',
      on: { contact_id: 'id' },
      fields: { email: { column: 'email', type: 'text' } },
    },
  },
  search: { columns: ['name', 'bio'] },
  sort: { default: ['-createdAt'] },
  page: { default: 20, max: 100 },
  cursor: { secret: env.CURSOR_SECRET }, // at least 32 bytes; see Best practices
});
```

```ts
const page = await contacts.paginate(
  db.selectFrom('contacts').select(['id', 'name', 'created_at']),
  {
    sort: ['-createdAt'],
    filter: {
      and: [
        { field: 'status', op: 'eq', value: 'customer' },
        { field: 'emails.email', op: 'endsWith', value: '@example.com' },
      ],
    },
    search: 'ada',
    page: { size: 25, after: query.page.after },
  },
  { total: true },
);

page.rows; // Array<{ id: string; name: string; created_at: Date }>: your selection, untouched
page.next; // the page[after] cursor of the next page, or null
page.prev; // the page[before] cursor of the previous page, or null
page.total; // the rows the filter and search select
page.cursor(row); // the cursor that falls on a row of this page
```

A typo in a table or column name is a type error; a request that sorts on an undeclared field,
filters with an operator the type does not accept, asks for more than `max` rows, or sends a cursor
issued under another sort is rejected before any query runs, with a typed error (see Errors).

### Define keysets against `DB`

`createDefineKeyset<DB>()` returns the core's `defineKeyset` with the names checked at compile time:
`table` must be a table of `DB`, every `column` a column of it, every relation's `table` a table of
`DB` with `on` pairing its columns to the main table's, every aggregate `column` a column of the
relation's table, and the search `columns` or `vector` columns of the main table. Call it once and
define every keyset with the result. The runtime is the core's, unchanged: the same validation, the
same `TypeError` naming the option at startup, the same definition.

Column names are the interface's. Under a `CamelCasePlugin` the interface says `createdAt`, so the
definition says `column: 'createdAt'`, and the plugin maps the `"contacts"."created_at"` reference
the adapter emits exactly as it maps your own. The adapter's private aliases (`keyset0`, `keyset1`,
...) contain no underscore or capital, so the plugin leaves them alone.

The core README covers what a definition can hold: field types and their operators, aggregates,
relations, search modes, the key, page bounds, and cursor options.

### Paginate

`keyset.paginate(query, request, options?)` plans the request, renders the plan onto `query`, runs
it, and assembles the page. `query` is any Kysely select of the definition's table:

- its **selection** is yours and comes back as `page.rows`, typed as Kysely typed it; the adapter
  adds the sort keys cast to text under private aliases and strips them again;
- its **`where`** clauses are kept and combined with the filter, so a tenant scope or a soft-delete
  predicate stays in your hands;
- its **`order by`, `limit`, and `offset`** are replaced;
- it must be a **plain selection**: no `distinct`, `group by`, `having`, or set operations. Joins
  are fine when they keep one row per row of the main table; a join that multiplies rows breaks the
  one-row-per-key assumption cursors rely on, so aggregate what you need through an aggregate field
  or a correlated subquery in the selection instead;
- the **main table** is referenced as `table.column`, so the definition's `table` must be the name
  or alias the query exposes.

```ts
const page = await contacts.paginate(
  db
    .selectFrom('contacts')
    .where('tenant_id', '=', tenantId)
    .where('deleted_at', 'is', null)
    .select(['id', 'name', 'created_at'])
    .select((eb) =>
      eb
        .selectFrom('contact_emails')
        .select(eb.fn.countAll().as('n'))
        .whereRef('contact_emails.contact_id', '=', 'contacts.id')
        .as('email_count'),
    ),
  request,
);
```

`paginate(keyset, query, request, options?)` is also exported as a function, for keysets defined
with the core's `defineKeyset` (untyped column names).

### The SQL

A first page, default sort, `select(['id', 'name'])`:

```sql
select "id", "name",
  cast("contacts"."created_at" as text) as "keyset0",
  cast("contacts"."id" as text) as "keyset1"
from "contacts"
order by "contacts"."created_at" desc nulls last, "contacts"."id" asc nulls last
limit $1   -- [21]
```

One more row than the page size is fetched to learn whether a next page exists. The key is appended
to every sort, so the order is total; every key gets an explicit `nulls last`.

The next page, through the cursor of the last row (the quick start's request with its filter and
search):

```sql
select "id", "name", "created_at",
  cast("contacts"."created_at" as text) as "keyset0",
  cast("contacts"."id" as text) as "keyset1"
from "contacts"
where (("contacts"."status" = $1
    and exists (select 1 as "one" from "contact_emails"
                where "contact_emails"."contact_id" = "contacts"."id"
                  and "contact_emails"."email" like $2))
    and to_tsvector('simple', concat_ws(' ', "contacts"."name", "contacts"."bio"))
        @@ websearch_to_tsquery('simple', $3))
  and (("contacts"."created_at" < $4 or "contacts"."created_at" is null)
    or ("contacts"."created_at" = $5
        and ("contacts"."id" > $6 or "contacts"."id" is null)))
order by "contacts"."created_at" desc nulls last, "contacts"."id" asc nulls last
limit $7
-- ["customer", "%@example.com", "ada", "2024-01-09 10:00:00+00", "2024-01-09 10:00:00+00", "2a1b…", 26]
```

The cursor's values are bound as text parameters that PostgreSQL casts back to the columns' types,
so a `timestamptz` keeps its microseconds and a `numeric` its digits. Every request value is a
parameter; the only literal is the text search configuration, validated at definition time.

The page before a cursor runs inverted so that `limit` keeps the rows nearest the cursor, and the
rows are reversed back into request order:

```sql
... where ("contacts"."created_at" > $1
       or ("contacts"."created_at" = $2 and "contacts"."id" < $3))
order by "contacts"."created_at" asc nulls first, "contacts"."id" desc nulls first
limit $4
```

An insensitive sort, an aggregate sort, and an `isNull` filter:

```sql
select "id", "name",
  cast(lower("contacts"."name") as text) as "keyset0",
  cast((select count(*) as "value" from "contact_emails"
        where "contact_emails"."contact_id" = "contacts"."id") as text) as "keyset1",
  cast("contacts"."id" as text) as "keyset2"
from "contacts"
where not "contacts"."age" is null
order by lower("contacts"."name") asc nulls last,
  (select count(*) as "value" from "contact_emails"
   where "contact_emails"."contact_id" = "contacts"."id") desc nulls last,
  "contacts"."id" asc nulls last
limit $1
```

Relation filters are `exists` over the relation's table correlated on every join pair; array
operators bind the list as one parameter (`"contacts"."tags" && $1`); patterns bind the escaped
pattern (`"contacts"."name" ilike $1` with `%ada%`).

### Totals and query events

`total: true` runs a second statement first, `select count(*) as "total"` over the filtered query
with the selection, ordering, limit, and offset cleared. It counts what the filter and the search
select, never the cursors, so it is the size of the whole collection the client is paging through.
The two statements are not in a transaction; under concurrent writes the total may differ from what
the pages add up to.

`onQuery` is called after each statement with its kind (`page` or `total`), SQL, parameters,
duration in milliseconds, and row count:

```ts
const page = await contacts.paginate(query, request, {
  total: true,
  onQuery: (event) =>
    log.debug({ kind: event.kind, ms: event.durationMs, rows: event.rowCount }, event.sql),
});
```

### Errors

`plan` and `paginate` reject a bad request before any query runs, with one of the core's
`KeysetError` classes: a stable `code`, the detail in fields, a constant message. A JSON:API layer
on [`jsonapi-kit`](https://github.com/ali-issa/jsonapi-kit) maps them to the profile's error
objects:

```ts
import {
  invalidCursor,
  jsonApiError,
  maxPageSizeExceededError,
  rangePaginationNotSupportedError,
  unsupportedSortError,
} from 'jsonapi-kit';
import { isKeysetError } from 'kysely-keyset';

function toJsonApi(error: unknown): never {
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
      throw jsonApiError('INVALID_QUERY_PARAMETER', {
        detail: error.message,
        source: { parameter: 'filter' },
      });
  }
}
```

With `jsonapi-kit`, the parsed query's `page` is the request's `page`, and the page is the
document's input:
`paginatedDocument(Contacts, { rows: page.rows, next: page.next, prev: page.prev, total: page.total, cursor: (row) => page.cursor(row) }, { url, query })`.
Keep both definitions' page bounds equal, since each applies its own default and max.

### Best practices

- **One definer, one module.** Export `createDefineKeyset<DB>()` once and define every keyset with
  it; a keyset defined with the core's untyped `defineKeyset` by mistake loses the name checks.
- **The secret is 32 random bytes from your secret manager**, never typed, never reused for another
  signing purpose, one per environment. Rotate with `previousSecrets`: add the current secret there,
  set the new one, deploy, and drop the old one after your longest cursor lifetime. Set `ttl` when
  cursors leave your control (emailed links, saved searches). A cursor is signed, not encrypted:
  anyone holding it can read the sort-key values of the row it points at, so do not offer a sort
  over a column the client must not learn.
- **Index for the sorts you offer.** A keyset query is a range scan over the sort columns followed
  by the key: `create index on contacts (created_at, id)` serves `-createdAt` in both directions. An
  insensitive field sorts and compares through `lower()`, so index the expression:
  `create index on contacts (lower(name), id)`. An aggregate sort computes a correlated subquery per
  candidate row; keep it for small relations, or maintain the value in a column (a trigger or a
  generated column where PostgreSQL allows it) and declare that column as a plain field.
- **Prefer a stored `tsvector` for search.** `search: { columns }` computes `to_tsvector` per row at
  query time; a generated column with a GIN index answers the same query from the index:

  ```sql
  alter table contacts add column search_vector tsvector
    generated always as (to_tsvector('simple', coalesce(name, '') || ' ' || coalesce(bio, ''))) stored;
  create index on contacts using gin (search_vector);
  ```

  then `search: { vector: 'search_vector', config: 'simple' }` with the same configuration on both
  sides. `like` search (`ILIKE '%term%'`) cannot use a B-tree index; use it for small tables or
  behind a `pg_trgm` index.

- **Pin the session time zone.** The text form of a `timestamptz` carries the session's zone
  (`2024-01-09 10:00:00+00` here, `03:00:00-07` on a session in Los Angeles). Comparisons are exact
  either way, because the text is self-describing, but cursors issued under different zones differ
  as strings; set `TimeZone=UTC` on the pool (`options: '-c TimeZone=UTC'` in node-postgres, or
  `alter role ... set timezone = 'UTC'`) when that matters to you.
- **Count only when the client needs it.** `total: true` is a second statement that scans what the
  filter selects; offer it on request (JSON:API's `meta.page.total`), not on every page, and
  consider an estimate for very large tables.
- **Keep the base query plain** (see Paginate) and treat `keyset0`, `keyset1`, ... as reserved
  selection names.
- **Validate at startup.** `defineKeyset` throws for a mistaken definition; import your keysets
  module during application boot (or in a test) so a wrong column, an unsortable key, or a short
  secret fails there rather than on the first request.

## Documentation

- [`docs/DESIGN.md`](https://github.com/ali-issa/keyset-kit/blob/main/docs/DESIGN.md): what the
  packages are, the principles, and the API by example
- [`docs/SPEC.md`](https://github.com/ali-issa/keyset-kit/blob/main/docs/SPEC.md): the normative
  contract, section by section, with the tests that prove it
- [`docs/adr/`](https://github.com/ali-issa/keyset-kit/tree/main/docs/adr): the decisions, including
  every choice the profile leaves to the server

## License

MIT
