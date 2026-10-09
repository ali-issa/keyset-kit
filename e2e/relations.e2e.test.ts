import type { Harness } from './support/db.ts';

/**
 * Relations and aggregates (SPEC 3.2, 3.3): `exists` filters over
 * related rows, and aggregate fields that sort, filter, and carry nulls
 * for rows without related rows.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { openPglite } from './support/db.ts';
import { contacts } from './support/keysets.ts';
import { emailCount, expectedIds, latestStart } from './support/schema.ts';

type ContactFilter = NonNullable<Parameters<typeof contacts.plan>[0]['filter']>;

describe('PGlite: relations', () => {
  let harness: Harness;
  beforeAll(async () => {
    harness = await openPglite();
  });
  afterAll(async () => {
    await harness.close();
  });

  async function names(
    filter: ContactFilter,
    sort: Array<string> = ['createdAt'],
  ): Promise<Array<string>> {
    const page = await contacts.paginate(
      harness.db.selectFrom('contacts').select(['id', 'first_name']),
      { filter, sort: sort as never, page: { size: 50 } },
    );
    return page.rows.map((row) => row.first_name);
  }

  it('filters on a relation field path', async () => {
    expect(
      await names({ field: 'emails.email', op: 'endsWith', value: '@x.io' }),
    ).toEqual(['Carol', 'Dan', 'Frank', 'Ivan', 'Mallory']);
    expect(
      await names({ field: 'workHistory.company', op: 'eq', value: 'Globex' }),
    ).toEqual(['Carol', 'Ivan']);
  });

  it('matches some related row against a combined predicate', async () => {
    expect(
      await names({
        relation: 'emails',
        some: {
          and: [
            { field: 'primary', op: 'eq', value: false },
            { field: 'email', op: 'endsWith', value: '@example.com' },
          ],
        },
      }),
    ).toEqual(['Carol', 'Frank', 'Mallory']);
    expect(
      await names({
        relation: 'workHistory',
        some: { field: 'startDate', op: 'lt', value: '1950-01-01' },
      }),
    ).toEqual(['Ada', 'Grace']);
  });

  it('negates a relation filter to find rows without a match', async () => {
    expect(
      await names({
        not: {
          relation: 'emails',
          some: { field: 'primary', op: 'eq', value: true },
        },
      }),
    ).toEqual(['ada', 'Eve', 'Heidi']);
  });

  it('sorts by an aggregate, with the key breaking ties', async () => {
    const page = await contacts.paginate(
      harness.db.selectFrom('contacts').select('id'),
      {
        sort: ['-emailCount'],
        page: { size: 50 },
      },
    );
    expect(page.rows.map((row) => row.id)).toEqual(
      expectedIds(['-emailCount']),
    );
    expect(emailCount(page.rows[0]?.id ?? '')).toBe(3);
  });

  it('sorts by a nullable aggregate with nulls last in both directions', async () => {
    const asc = await contacts.paginate(
      harness.db.selectFrom('contacts').select('id'),
      {
        sort: ['latestStart'],
        page: { size: 50 },
      },
    );
    expect(asc.rows.map((row) => row.id)).toEqual(expectedIds(['latestStart']));
    expect(
      asc.rows.slice(-5).every((row) => latestStart(row.id) === null),
    ).toBe(true);
    const desc = await contacts.paginate(
      harness.db.selectFrom('contacts').select('id'),
      {
        sort: ['-latestStart'],
        page: { size: 50 },
      },
    );
    expect(desc.rows.map((row) => row.id)).toEqual(
      expectedIds(['-latestStart']),
    );
    expect(
      desc.rows.slice(-5).every((row) => latestStart(row.id) === null),
    ).toBe(true);
  });

  it('filters on aggregates', async () => {
    expect(await names({ field: 'emailCount', op: 'gte', value: 2 })).toEqual([
      'Ada',
      'Carol',
      'Frank',
      'Mallory',
    ]);
    expect(await names({ field: 'emailCount', op: 'eq', value: '0' })).toEqual([
      'ada',
      'Eve',
      'Heidi',
    ]);
    expect(await names({ field: 'latestStart', op: 'isNull' })).toEqual([
      'ada',
      'Bob',
      'Eve',
      'Heidi',
      'Judy',
    ]);
    expect(
      await names({ field: 'latestStart', op: 'gte', value: '2015-01-01' }),
    ).toEqual(['Carol', 'Ivan', 'Mallory']);
  });

  it('paginates across an aggregate sort without losing rows', async () => {
    const expected = expectedIds(['-emailCount', 'lastName']);
    const seen: Array<string> = [];
    let page = await contacts.paginate(
      harness.db.selectFrom('contacts').select('id'),
      {
        sort: ['-emailCount', 'lastName'],
        page: { size: 2 },
      },
    );
    for (;;) {
      seen.push(...page.rows.map((row) => row.id));
      if (page.next === null) {
        break;
      }
      page = await contacts.paginate(
        harness.db.selectFrom('contacts').select('id'),
        {
          sort: ['-emailCount', 'lastName'],
          page: { size: 2, after: page.next },
        },
      );
    }
    expect(seen).toEqual(expected);
  });
});
