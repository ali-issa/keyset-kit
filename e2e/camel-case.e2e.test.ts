import type { CamelDB } from './support/db.ts';

/**
 * `CamelCasePlugin` (SPEC 10.1): a definition written with the camelCase
 * column names of the application's interface renders snake_case SQL,
 * rows come back camelCase, the private aliases survive the plugin, and
 * cursors are interchangeable with a snake_case definition of the same
 * fields because they bind to the request, not to the SQL.
 * @ref https://kysely.dev/docs/plugins#camel-case-plugin
 */
import { CamelCasePlugin, Kysely, PGliteDialect } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { openPglite } from './support/db.ts';
import { camelContacts, contacts } from './support/keysets.ts';
import { expectedIds } from './support/schema.ts';

describe('PGlite: CamelCasePlugin', () => {
  let harness: Awaited<ReturnType<typeof openPglite>>;
  let camel: Kysely<CamelDB>;
  beforeAll(async () => {
    harness = await openPglite();
    camel = new Kysely<CamelDB>({
      dialect: new PGliteDialect({ pglite: harness.pglite }),
      plugins: [new CamelCasePlugin()],
    });
  });
  afterAll(async () => {
    await camel.destroy();
    await harness.close();
  });

  it('paginates with camelCase names end to end', async () => {
    const events: Array<string> = [];
    const page = await camelContacts.paginate(
      camel
        .selectFrom('contacts')
        .select(['id', 'firstName', 'lastName', 'createdAt']),
      {
        sort: ['-lastName', 'createdAt'],
        filter: { field: 'emails.email', op: 'endsWith', value: '.com' },
        search: 'a',
        page: { size: 3 },
      },
      {
        onQuery: (event) => {
          events.push(event.sql);
        },
      },
    );
    expect(events[0]).toContain('"contacts"."last_name"');
    expect(events[0]).toContain(
      '"contact_emails"."contact_id" = "contacts"."id"',
    );
    expect(events[0]).toContain('as "keyset0"');
    expect(page.rows.map((row) => row.firstName)).toEqual([
      'Frank',
      'Mallory',
      'Ada',
    ]);
    expect(Object.keys(page.rows[0] ?? {})).toEqual([
      'id',
      'firstName',
      'lastName',
      'createdAt',
    ]);
    expect(page.hasNext).toBe(true);
  });

  it('shares cursors with the snake_case definition of the same fields', async () => {
    const snake = await contacts.paginate(
      harness.db.selectFrom('contacts').select('id'),
      {
        sort: ['-emailCount', 'lastName'],
        page: { size: 4 },
      },
    );
    const viaCamel = await camelContacts.paginate(
      camel.selectFrom('contacts').select('id'),
      {
        sort: ['-emailCount', 'lastName'],
        page: { size: 4, after: snake.next ?? '' },
      },
    );
    expect(viaCamel.rows.map((row) => row.id)).toEqual(
      expectedIds(['-emailCount', 'lastName']).slice(4, 8),
    );
    const back = await contacts.paginate(
      harness.db.selectFrom('contacts').select('id'),
      {
        sort: ['-emailCount', 'lastName'],
        page: { size: 4, before: viaCamel.prev ?? '' },
      },
    );
    expect(back.rows.map((row) => row.id)).toEqual(
      snake.rows.map((row) => row.id),
    );
  });
});
