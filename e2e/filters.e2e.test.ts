/**
 * Every filter operator against real rows (SPEC 4): the predicate the core
 * builds and the adapter renders must select exactly the seed rows the
 * operator's definition promises, including nulls, mixed case, arrays,
 * enums, decimals, dates, and microsecond timestamps.
 */
import type { Harness } from './support/db.ts';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { InvalidFilterValueError, UnsupportedFilterError } from 'kysely-keyset';

import { openPglite } from './support/db.ts';
import { contacts } from './support/keysets.ts';
import { CONTACTS, expectedIds } from './support/schema.ts';

/** Every first name in `createdAt, id` order, the order the names helper uses. */
const ALL: Array<string> = expectedIds(['createdAt']).map(
  (id) => CONTACTS.find((row) => row.id === id)?.first_name ?? '',
);

type ContactFilter = NonNullable<Parameters<typeof contacts.plan>[0]['filter']>;

describe('PGlite: filters', () => {
  let harness: Harness;
  beforeAll(async () => {
    harness = await openPglite();
  });
  afterAll(async () => {
    await harness.close();
  });

  async function names(filter: ContactFilter): Promise<Array<string>> {
    const page = await contacts.paginate(
      harness.db.selectFrom('contacts').select(['id', 'first_name']),
      { filter, sort: ['createdAt'], page: { size: 50 } },
    );
    return page.rows.map((row) => row.first_name);
  }

  it.each<[string, ContactFilter, Array<string>]>([
    ['eq text', { field: 'firstName', op: 'eq', value: 'Ada' }, ['Ada']],
    [
      'ne text',
      { field: 'firstName', op: 'ne', value: 'Ada' },
      ALL.filter((name) => name !== 'Ada'),
    ],
    [
      'in enum',
      { field: 'status', op: 'in', value: ['customer'] },
      ['Ada', 'Carol', 'Eve', 'Grace', 'Judy', 'Mallory'],
    ],
    [
      'nin enum',
      { field: 'status', op: 'nin', value: ['customer', 'lead'] },
      [],
    ],
    [
      'gt integer as string',
      { field: 'age', op: 'gt', value: '36' },
      ['Carol', 'Grace'],
    ],
    [
      'gte integer',
      { field: 'age', op: 'gte', value: 36 },
      ['ada', 'Ada', 'Carol', 'Grace'],
    ],
    ['lt integer', { field: 'age', op: 'lt', value: 30 }, ['Dan', 'Eve']],
    [
      'lte integer',
      { field: 'age', op: 'lte', value: 30 },
      ['Dan', 'Eve', 'Ivan', 'Heidi', 'Mallory'],
    ],
    [
      'between integer',
      { field: 'age', op: 'between', value: [30, 36] },
      ['ada', 'Ada', 'Ivan', 'Heidi', 'Mallory'],
    ],
    ['isNull', { field: 'age', op: 'isNull' }, ['Bob', 'Frank', 'Judy']],
    [
      'isNull false',
      { field: 'birthday', op: 'isNull', value: false },
      ['Ada', 'Bob', 'Carol', 'Eve', 'Frank', 'Grace', 'Ivan', 'Judy'],
    ],
    [
      'decimal exact',
      { field: 'score', op: 'eq', value: '2.25' },
      ['Carol', 'Dan'],
    ],
    [
      'decimal gt',
      { field: 'score', op: 'gt', value: '9.5' },
      ['Frank', 'Grace'],
    ],
    [
      'boolean text form',
      { field: 'active', op: 'eq', value: 'false' },
      ['ada', 'Dan', 'Grace', 'Judy'],
    ],
    [
      'date between',
      { field: 'birthday', op: 'between', value: ['1900-01-01', '1990-12-31'] },
      ['Bob', 'Carol', 'Frank', 'Grace', 'Ivan', 'Judy'],
    ],
    [
      'date eq leap day',
      { field: 'birthday', op: 'eq', value: '1988-02-29' },
      ['Ivan'],
    ],
    [
      'timestamptz microsecond',
      { field: 'createdAt', op: 'gt', value: '2024-01-01T10:00:00.000000Z' },
      ALL,
    ],
    [
      'timestamptz exact microsecond',
      { field: 'createdAt', op: 'eq', value: '2024-01-05T23:59:59.999999Z' },
      ['Frank'],
    ],
    [
      'timestamptz with offset',
      { field: 'createdAt', op: 'gte', value: '2024-01-09T12:00:00+02:00' },
      ['Mallory'],
    ],
    [
      'contains',
      { field: 'firstName', op: 'contains', value: 'ra' },
      ['Frank', 'Grace'],
    ],
    [
      'containsi',
      { field: 'firstName', op: 'containsi', value: 'AD' },
      ['ada', 'Ada'],
    ],
    [
      'startsWith',
      { field: 'firstName', op: 'startsWith', value: 'A' },
      ['Ada'],
    ],
    [
      'startsWithi',
      { field: 'firstName', op: 'startsWithi', value: 'a' },
      ['ada', 'Ada'],
    ],
    [
      'endsWith',
      { field: 'firstName', op: 'endsWith', value: 'e' },
      ['Eve', 'Grace'],
    ],
    [
      'endsWithi',
      { field: 'firstName', op: 'endsWithi', value: 'E' },
      ['Eve', 'Grace'],
    ],
    ['eqi', { field: 'firstName', op: 'eqi', value: 'ADA' }, ['ada', 'Ada']],
    [
      'contains escapes wildcards',
      { field: 'bio', op: 'contains', value: '100%' },
      ['Carol'],
    ],
    [
      'contains escapes underscore',
      { field: 'bio', op: 'contains', value: '_' },
      [],
    ],
    [
      'insensitive collation eq',
      { field: 'lastName', op: 'eq', value: 'LoVeLaCe' },
      ['Ada', 'Carol', 'Judy'],
    ],
    [
      'insensitive collation in',
      { field: 'lastName', op: 'in', value: ['null', 'KLUM'] },
      ['Bob', 'Heidi', 'Mallory'],
    ],
    [
      'insensitive collation startsWith',
      { field: 'lastName', op: 'startsWith', value: 'love' },
      ['Ada', 'Carol', 'Judy'],
    ],
    [
      'insensitive collation lt',
      { field: 'lastName', op: 'lt', value: 'C' },
      ['ada'],
    ],
    [
      'array contains',
      { field: 'tags', op: 'contains', value: ['ops'] },
      ['Carol', 'Dan', 'Ivan'],
    ],
    [
      'array contains all',
      { field: 'tags', op: 'contains', value: ['ops', 'sec'] },
      ['Ivan'],
    ],
    [
      'array overlaps',
      { field: 'tags', op: 'overlaps', value: ['math', 'music'] },
      ['ada', 'Ada', 'Frank', 'Judy'],
    ],
    [
      'array containedBy',
      { field: 'tags', op: 'containedBy', value: ['math', 'pioneer'] },
      ['ada', 'Ada', 'Bob', 'Heidi', 'Judy'],
    ],
    ['array contains empty', { field: 'tags', op: 'contains', value: [] }, ALL],
    ['empty in', { field: 'age', op: 'in', value: [] }, []],
    ['empty nin', { field: 'age', op: 'nin', value: [] }, ALL],
    [
      'uuid eq',
      { field: 'id', op: 'eq', value: '7C9E6679-7425-40DE-944B-E07FC1F90AE7' },
      ['Ada'],
    ],
  ])('%s', async (_label, filter, expected) => {
    expect(await names(filter)).toEqual(expected);
  });

  it('combines and, or, and not', async () => {
    const filter: ContactFilter = {
      and: [
        { field: 'active', op: 'eq', value: true },
        {
          or: [
            { field: 'age', op: 'isNull' },
            { field: 'tags', op: 'contains', value: ['sec'] },
          ],
        },
        { not: { field: 'firstName', op: 'startsWith', value: 'M' } },
      ],
    };
    expect(await names(filter)).toEqual(['Bob', 'Eve', 'Frank', 'Ivan']);
  });

  it('rejects an operator the field does not accept and a bad value before querying', async () => {
    const query = harness.db.selectFrom('contacts').selectAll();
    await expect(
      contacts.paginate(query, {
        filter: { field: 'age', op: 'contains', value: '3' },
      }),
    ).rejects.toBeInstanceOf(UnsupportedFilterError);
    await expect(
      contacts.paginate(query, {
        filter: { field: 'age', op: 'eq', value: 'thirty' },
      }),
    ).rejects.toBeInstanceOf(InvalidFilterValueError);
    await expect(
      contacts.paginate(query, {
        filter: { field: 'status', op: 'eq', value: 'vip' } as never,
      }),
    ).rejects.toMatchObject({ expected: 'one of "lead", "customer"' });
  });

  it('counts what the filter selects', async () => {
    const page = await contacts.paginate(
      harness.db.selectFrom('contacts').select('id'),
      {
        filter: { field: 'tags', op: 'overlaps', value: ['ops', 'sec'] },
        page: { size: 1 },
      },
      { total: true },
    );
    expect(page.total).toBe(5);
    expect(page.rows).toHaveLength(1);
  });
});
