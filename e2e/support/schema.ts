/**
 * The e2e database: three tables with every field type the definition
 * supports (the seed in `seed.ts` has equal sort values, nulls in sortable
 * columns, mixed-case text, microsecond timestamps, enums, arrays, and
 * relations with zero, one, or several rows). `expectedIds` orders the
 * seed in JavaScript so the tests never trust the SQL under test to
 * produce its own expectation.
 */
import type { ContactSeed } from './seed.ts';

import { CONTACTS, EMAILS, WORK } from './seed.ts';

export { CONTACTS, EMAILS, WORK } from './seed.ts';

export const STATEMENTS: ReadonlyArray<string> = [
  `create type contact_status as enum ('lead', 'customer')`,
  `create table contacts (
    id uuid primary key,
    first_name text not null,
    last_name text,
    age integer,
    score numeric(10, 2) not null,
    active boolean not null,
    status contact_status not null,
    tags text[] not null,
    created_at timestamptz not null,
    birthday date,
    bio text not null,
    search_vector tsvector generated always as (
      to_tsvector('simple', coalesce(first_name, '') || ' ' || coalesce(last_name, '') || ' ' || bio)
    ) stored
  )`,
  `create table contact_emails (
    id serial primary key,
    contact_id uuid not null references contacts (id),
    email text not null,
    is_primary boolean not null
  )`,
  `create table work_history (
    id serial primary key,
    contact_id uuid not null references contacts (id),
    company text not null,
    start_date date not null
  )`,
];

export function emailCount(contactId: string): number {
  return EMAILS.filter((email) => email.contact_id === contactId).length;
}

export function latestStart(contactId: string): string | null {
  const dates = WORK.filter((work) => work.contact_id === contactId).map(
    (work) => work.start_date,
  );
  return dates.length === 0 ? null : (dates.toSorted().at(-1) ?? null);
}

/** Sortable fields of the keyset and the comparable value of each. */
export type SortableField =
  | 'id'
  | 'lastName'
  | 'age'
  | 'score'
  | 'createdAt'
  | 'birthday'
  | 'emailCount'
  | 'latestStart';

type Comparable = string | number | null;

const SORTABLE: ReadonlySet<string> = new Set<string>([
  'id',
  'lastName',
  'age',
  'score',
  'createdAt',
  'birthday',
  'emailCount',
  'latestStart',
]);

function isSortableField(value: string): value is SortableField {
  return SORTABLE.has(value);
}

const VALUES: Readonly<
  Record<SortableField, (row: ContactSeed) => Comparable>
> = {
  id: (row) => row.id,
  lastName: (row) => row.last_name?.toLowerCase() ?? null,
  age: (row) => row.age,
  score: (row) => Number(row.score),
  createdAt: (row) => row.created_at,
  birthday: (row) => row.birthday,
  emailCount: (row) => emailCount(row.id),
  latestStart: (row) => latestStart(row.id),
};

function compare(a: Comparable, b: Comparable): number {
  if (a === null || b === null) {
    // Nulls last in both directions, like the library's order.
    return a === b ? 0 : a === null ? 1 : -1;
  }
  if (typeof a === 'number' && typeof b === 'number') {
    return a - b;
  }
  return String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0;
}

/** The ids in the order the given sort (with `id` as the tie-breaker) must produce. */
export function expectedIds(sort: ReadonlyArray<string>): Array<string> {
  const keys = sort.map((item) => {
    const desc = item.startsWith('-');
    const field = desc ? item.slice(1) : item;
    if (!isSortableField(field)) {
      throw new Error(`not a sortable field of the seed: ${field}`);
    }
    return { field, desc };
  });
  if (!keys.some((key) => key.field === 'id')) {
    keys.push({ field: 'id', desc: false });
  }
  return CONTACTS.toSorted((a, b) => {
    for (const key of keys) {
      const va = VALUES[key.field](a);
      const vb = VALUES[key.field](b);
      if (va === null || vb === null) {
        const order = compare(va, vb);
        if (order !== 0) {
          return order;
        }
        continue;
      }
      const order = compare(va, vb);
      if (order !== 0) {
        return key.desc ? -order : order;
      }
    }
    return 0;
  }).map((row) => row.id);
}
