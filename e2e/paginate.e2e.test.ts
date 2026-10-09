import type { Harness } from './support/db.ts';

/**
 * The pagination invariants over PGlite (SPEC 11.1): every sort in
 * `SORTS`, every page size in `SIZES`, forward, backward, from item
 * cursors, and back again.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { openPglite } from './support/db.ts';
import { runInvariants } from './support/invariants.ts';
import { composite, contacts } from './support/keysets.ts';
import { expectedIds } from './support/schema.ts';

runInvariants('PGlite', openPglite);

describe('PGlite: page shape', () => {
  let harness: Harness;
  beforeAll(async () => {
    harness = await openPglite();
  });
  afterAll(async () => {
    await harness.close();
  });

  it('uses the definition defaults and strips the private aliases from rows', async () => {
    const page = await contacts.paginate(
      harness.db.selectFrom('contacts').selectAll(),
      {},
    );
    expect(page.size).toBe(5);
    expect(page.rows).toHaveLength(5);
    expect(Object.keys(page.rows[0] ?? {})).not.toContain('keyset0');
    expect(page.rows.map((row) => row.id)).toEqual(
      expectedIds(['id']).slice(0, 5),
    );
    expect(page.total).toBeUndefined();
  });

  it('counts the filtered rows when asked, independent of the cursor', async () => {
    const first = await contacts.paginate(
      harness.db.selectFrom('contacts').selectAll(),
      { filter: { field: 'active', op: 'eq', value: true }, page: { size: 2 } },
      { total: true },
    );
    expect(first.total).toBe(8);
    const second = await contacts.paginate(
      harness.db.selectFrom('contacts').selectAll(),
      {
        filter: { field: 'active', op: 'eq', value: true },
        page: { size: 2, after: first.next ?? '' },
      },
      { total: true },
    );
    expect(second.total).toBe(8);
    expect(second.rows.map((row) => row.id)).not.toEqual(
      first.rows.map((row) => row.id),
    );
  });

  it('reports each query with its SQL, parameters, and timing', async () => {
    const events: Array<{
      kind: string;
      sql: string;
      rowCount: number;
      durationMs: number;
    }> = [];
    await contacts.paginate(
      harness.db.selectFrom('contacts').selectAll(),
      { page: { size: 3 } },
      {
        total: true,
        onQuery: (event) => {
          events.push(event);
        },
      },
    );
    expect(events.map((event) => event.kind)).toEqual(['total', 'page']);
    expect(events[0]?.sql).toContain('count(*)');
    expect(events[1]?.sql).toContain('nulls last');
    expect(events[1]?.rowCount).toBe(4);
    expect(events[1]?.durationMs).toBeGreaterThan(0);
  });

  it('keeps a composite key total through equal timestamps', async () => {
    const expected = expectedIds(['-createdAt', '-id']);
    const seen: Array<string> = [];
    let page = await composite.paginate(
      harness.db.selectFrom('contacts').select('id'),
      {},
    );
    for (;;) {
      seen.push(...page.rows.map((row) => row.id));
      if (page.next === null) {
        break;
      }
      page = await composite.paginate(
        harness.db.selectFrom('contacts').select('id'),
        {
          page: { after: page.next },
        },
      );
    }
    expect(seen).toEqual(expected);
    const plan = await composite.plan({ sort: ['age'] });
    expect(plan.keys.map((key) => key.field)).toEqual([
      'age',
      'createdAt',
      'id',
    ]);
  });

  it('works with a base query that joins and aliases nothing but selects a subset', async () => {
    const page = await contacts.paginate(
      harness.db
        .selectFrom('contacts')
        .select(['id', 'first_name'])
        .where('status', '=', 'customer'),
      { sort: ['-score'], page: { size: 10 } },
    );
    // Judy and Mallory share a score; the key breaks the tie.
    expect(page.rows.map((row) => row.first_name)).toEqual([
      'Grace',
      'Ada',
      'Eve',
      'Mallory',
      'Judy',
      'Carol',
    ]);
  });
});
