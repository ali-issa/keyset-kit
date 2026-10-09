import type { DB, Harness } from './support/db.ts';

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

/**
 * Cursor safety (SPEC 8): a cursor is bound to the sort, filter, and
 * search it was issued for; it cannot be forged, reused elsewhere, or used
 * after its TTL; and it survives a secret rotation.
 */
import { createDefineKeyset, InvalidCursorError } from 'kysely-keyset';

import { openPglite } from './support/db.ts';
import {
  COLUMN_FIELDS,
  contacts,
  expiring,
  SECRET,
} from './support/keysets.ts';

const MS_PER_SECOND = 1000;

describe('PGlite: cursors', () => {
  let harness: Harness;
  beforeAll(async () => {
    harness = await openPglite();
  });
  afterAll(async () => {
    await harness.close();
  });

  const query = () => harness.db.selectFrom('contacts').select('id');

  async function reason(
    request: Parameters<typeof contacts.paginate>[1],
  ): Promise<string> {
    try {
      await contacts.paginate(query(), request);
    } catch (error) {
      if (error instanceof InvalidCursorError) {
        return `${error.parameter}:${error.reason}`;
      }
      throw error;
    }
    return 'accepted';
  }

  it('rejects a cursor under another sort, filter, or search', async () => {
    const page = await contacts.paginate(query(), {
      sort: ['-age'],
      page: { size: 2 },
    });
    const after = page.next ?? '';
    expect(await reason({ sort: ['-age'], page: { after } })).toBe('accepted');
    expect(await reason({ sort: ['age'], page: { after } })).toBe(
      'after:context',
    );
    expect(
      await reason({
        sort: ['-age'],
        filter: { field: 'active', op: 'eq', value: true },
        page: { after },
      }),
    ).toBe('after:context');
    expect(
      await reason({ sort: ['-age'], search: 'ada', page: { after } }),
    ).toBe('after:context');
    expect(await reason({ sort: ['-age'], page: { before: after } })).toBe(
      'accepted',
    );
  });

  it('rejects tampered, foreign, and malformed cursors', async () => {
    const page = await contacts.paginate(query(), { page: { size: 2 } });
    const after = page.next ?? '';
    const [payload, tag] = after.split('.') as [string, string];
    expect(
      await reason({
        page: {
          after: `${payload.startsWith('e') ? 'f' : 'e'}${payload.slice(1)}.${tag}`,
        },
      }),
    ).toBe('after:signature');
    expect(
      await reason({ page: { after: `${payload}.${tag.slice(1)}A` } }),
    ).toBe('after:signature');
    expect(await reason({ page: { after: 'not-a-cursor' } })).toBe(
      'after:malformed',
    );
    expect(await reason({ page: { before: '' } })).toBe('before:malformed');
    const other = createDefineKeyset<DB>()({
      table: 'contacts',
      key: ['id'],
      fields: COLUMN_FIELDS,
      cursor: { secret: 'a-different-secret-of-at-least-32-bytes' },
    });
    await expect(
      other.paginate(query(), { page: { after } }),
    ).rejects.toMatchObject({
      parameter: 'after',
      reason: 'signature',
    });
  });

  it('expires cursors after the ttl', async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2026-10-08T12:00:00Z'));
      const page = await expiring.paginate(query(), { page: { size: 2 } });
      const after = page.next ?? '';
      vi.setSystemTime(new Date('2026-10-08T12:00:01Z'));
      await expect(
        expiring.paginate(query(), { page: { after } }),
      ).resolves.toBeDefined();
      vi.setSystemTime(new Date('2026-10-08T12:00:02.5Z'));
      await expect(
        expiring.paginate(query(), { page: { after } }),
      ).rejects.toMatchObject({
        reason: 'expired',
      });
    } finally {
      vi.useRealTimers();
    }
    expect(Date.now()).toBeGreaterThan(MS_PER_SECOND);
  });

  it('accepts cursors signed by a previous secret during rotation', async () => {
    const page = await contacts.paginate(query(), { page: { size: 2 } });
    const rotated = createDefineKeyset<DB>()({
      table: 'contacts',
      key: ['id'],
      fields: COLUMN_FIELDS,
      page: { default: 5, max: 50, range: true },
      cursor: {
        secret: 'the-new-secret-with-at-least-32-bytes',
        previousSecrets: [SECRET],
      },
    });
    const next = await rotated.paginate(query(), {
      page: { size: 2, after: page.next ?? '' },
    });
    expect(next.rows).toHaveLength(2);
    await expect(
      contacts.paginate(query(), { page: { after: next.next ?? '' } }),
    ).rejects.toMatchObject({
      reason: 'signature',
    });
  });

  it('issues cursors that are opaque, URL-safe, and bound to the row', async () => {
    const page = await contacts.paginate(query(), {
      sort: ['-createdAt'],
      page: { size: 3 },
    });
    for (const cursor of page.cursors) {
      expect(cursor).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/u);
      expect(encodeURIComponent(cursor)).toBe(cursor);
    }
    expect(page.cursor(page.rows[0]!)).toBe(page.cursors[0]);
    expect(page.next).toBe(page.cursors[2]);
  });
});
