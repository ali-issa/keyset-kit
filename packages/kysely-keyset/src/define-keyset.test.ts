import { describe, expect, it } from 'vitest';

import { canned } from './test-support/db';
import {
  CONTACTS,
  contacts,
  defineTyped,
  typedContacts,
} from './test-support/keysets';

describe('createDefineKeyset', () => {
  it('produces the same definition as the core', () => {
    expect(typedContacts.definition).toEqual(contacts.definition);
  });

  it('plans like the core and adds paginate', async () => {
    const plan = await typedContacts.plan({ sort: ['-age'] });
    expect(plan.context).toBe(
      (await contacts.plan({ sort: ['-age'] })).context,
    );
    const { db, recorded } = canned([[]]);
    const page = await typedContacts.paginate(
      db.selectFrom('contacts').selectAll(),
      {
        filter: { field: 'emails.email', op: 'endsWith', value: '@x.io' },
      },
    );
    expect(page.rows).toEqual([]);
    expect(recorded.queries[0]?.sql).toContain(
      'exists (select 1 as "one" from "contact_emails"',
    );
  });

  it('validates like the core', () => {
    expect(() =>
      defineTyped({
        ...CONTACTS,
        fields: { id: { column: 'id', type: 'uuid' } },
        relations: undefined,
        key: ['id'],
        cursor: { secret: 'short' },
      }),
    ).toThrow(new TypeError('cursor.secret must be at least 32 bytes'));
  });
});
