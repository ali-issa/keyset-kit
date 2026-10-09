import type { Harness } from './support/db.ts';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Search (SPEC 3.4): `like` over concatenated columns, and PostgreSQL text
 * search over a stored `tsvector` or computed from columns, in each
 * parsing mode. Search terms are parameters; `%`, `_`, and tsquery syntax
 * in them never escape.
 * @ref https://www.postgresql.org/docs/current/textsearch-controls.html#TEXTSEARCH-PARSING-QUERIES
 */
import { UnsupportedSearchError } from 'kysely-keyset';

import { openPglite } from './support/db.ts';
import { composite, contacts, phrased, searchable } from './support/keysets.ts';

describe('PGlite: search', () => {
  let harness: Harness;
  beforeAll(async () => {
    harness = await openPglite();
  });
  afterAll(async () => {
    await harness.close();
  });

  async function names(
    keyset: typeof contacts | typeof phrased,
    search: string,
  ): Promise<Array<string>> {
    const page = await keyset.paginate(
      harness.db.selectFrom('contacts').select(['id', 'first_name']),
      { search, sort: ['createdAt'], page: { size: 50 } },
    );
    return page.rows.map((row) => row.first_name);
  }

  it('like: matches any column, case-insensitively, trimmed', async () => {
    expect(await names(contacts, '  ADA ')).toEqual(['ada', 'Ada']);
    expect(await names(contacts, 'lovelace')).toEqual(['Ada', 'Carol', 'Judy']);
    expect(await names(contacts, 'a love')).toEqual(['Ada']);
    expect(await names(contacts, '%')).toEqual([]);
    expect(await names(contacts, '_')).toEqual([]);
    expect(await names(contacts, '')).toHaveLength(12);
  });

  it('like: combines with the filter and counts', async () => {
    const page = await contacts.paginate(
      harness.db.selectFrom('contacts').select('id'),
      {
        search: 'love',
        filter: { field: 'active', op: 'eq', value: true },
        page: { size: 1 },
      },
      { total: true },
    );
    expect(page.total).toBe(2);
  });

  it('websearch over a stored tsvector: words, negation, phrases', async () => {
    expect(await names(searchable, 'lovelace')).toEqual([
      'Ada',
      'Carol',
      'Judy',
    ]);
    expect(await names(searchable, 'lovelace -ada')).toEqual(['Carol', 'Judy']);
    expect(await names(searchable, '"first program"')).toEqual(['Ada']);
    expect(await names(searchable, 'bug or epoch')).toEqual(['Grace', 'Judy']);
    expect(await names(searchable, 'nobody')).toEqual([]);
    expect(await names(searchable, '&&& !!! (((')).toEqual([]);
  });

  it('phrase search computed over columns with the english configuration', async () => {
    expect(await names(phrased, 'plays guitar')).toEqual(['Frank']);
    expect(await names(phrased, 'guitar plays')).toEqual([]);
    expect(await names(phrased, 'the machines')).toEqual(['Carol']);
  });

  it('rejects a search when the definition has none', async () => {
    await expect(
      composite.paginate(harness.db.selectFrom('contacts').selectAll(), {
        search: 'ada',
      }),
    ).rejects.toBeInstanceOf(UnsupportedSearchError);
  });
});
