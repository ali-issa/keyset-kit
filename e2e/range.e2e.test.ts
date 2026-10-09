import type { Harness } from './support/db.ts';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Range requests (SPEC 7.1): `after` and `before` together select the
 * rows between two items, default to the max page size, and report
 * truncation, as the Cursor Pagination profile prescribes.
 * @ref https://jsonapi.org/profiles/ethanresnick/cursor-pagination/#auto-id--query-parameters
 */
import { RangeNotSupportedError } from 'kysely-keyset';

import { openPglite } from './support/db.ts';
import { contacts, searchable } from './support/keysets.ts';
import { expectedIds } from './support/schema.ts';

describe('PGlite: range requests', () => {
  let harness: Harness;
  beforeAll(async () => {
    harness = await openPglite();
  });
  afterAll(async () => {
    await harness.close();
  });

  const query = () => harness.db.selectFrom('contacts').select('id');

  it('selects the rows strictly between two cursors in the max page size', async () => {
    const all = await contacts.paginate(query(), {
      sort: ['-score'],
      page: { size: 50 },
    });
    const expected = expectedIds(['-score']);
    expect(all.rows.map((row) => row.id)).toEqual(expected);
    const range = await contacts.paginate(query(), {
      sort: ['-score'],
      page: { after: all.cursors[1], before: all.cursors[9] },
    });
    expect(range.size).toBe(50);
    expect(range.rows.map((row) => row.id)).toEqual(expected.slice(2, 9));
    expect(range.rangeTruncated).toBeUndefined();
    expect(range.hasNext).toBe(true);
    expect(range.hasPrev).toBe(true);
    expect(range.next).toBe(range.cursors.at(-1));
    expect(range.prev).toBe(range.cursors[0]);
  });

  it('marks a truncated range', async () => {
    const all = await contacts.paginate(query(), { page: { size: 50 } });
    const range = await contacts.paginate(query(), {
      page: { size: 3, after: all.cursors[0], before: all.cursors[11] },
    });
    expect(range.rows.map((row) => row.id)).toEqual(
      expectedIds(['id']).slice(1, 4),
    );
    expect(range.rangeTruncated).toBe(true);
  });

  it('is empty between adjacent items and still links both ways', async () => {
    const all = await contacts.paginate(query(), { page: { size: 50 } });
    const range = await contacts.paginate(query(), {
      page: { after: all.cursors[3], before: all.cursors[4] },
    });
    expect(range.rows).toEqual([]);
    expect(range.next).toBe(all.cursors[4]);
    expect(range.prev).toBe(all.cursors[3]);
  });

  it('is refused by a definition without range support', async () => {
    const all = await searchable.paginate(query(), { page: { size: 50 } });
    await expect(
      searchable.paginate(query(), {
        page: { after: all.cursors[0], before: all.cursors[5] },
      }),
    ).rejects.toBeInstanceOf(RangeNotSupportedError);
  });
});
