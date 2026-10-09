import { describe, expect, it } from 'vitest';

import { thrown } from '../test-support/fixtures';
import { normalizeRelations } from './normalize-relations';

function message(fn: () => unknown): string {
  const error = thrown(fn);
  expect(error).toBeInstanceOf(TypeError);
  return (error as TypeError).message;
}

describe('normalizeRelations', () => {
  it('is empty when none are declared', () => {
    expect(normalizeRelations().size).toBe(0);
  });

  it('keeps the join pairs in order and normalizes the relation fields', () => {
    const relations = normalizeRelations({
      emails: {
        table: 'contact_emails',
        on: { contact_id: 'id', tenant_id: 'tenant_id' },
        fields: { email: { column: 'email', type: 'text', nullable: true } },
      },
      phones: { table: 'contact_phones', on: { contact_id: 'id' } },
    });
    const emails = relations.get('emails');
    expect(emails?.table).toBe('contact_emails');
    expect(emails?.on).toEqual([
      ['contact_id', 'id'],
      ['tenant_id', 'tenant_id'],
    ]);
    expect(emails?.fields.get('email')).toMatchObject({
      kind: 'column',
      column: 'email',
      nullable: true,
    });
    expect(relations.get('phones')?.fields.size).toBe(0);
  });

  it('names the option of every mistake', () => {
    expect(message(() => normalizeRelations('emails'))).toBe(
      'relations must be an object',
    );
    expect(message(() => normalizeRelations({ emails: 1 }))).toBe(
      'relations.emails must be an object',
    );
    expect(message(() => normalizeRelations({ emails: { on: {} } }))).toBe(
      'relations.emails.table must be a non-empty string',
    );
    expect(
      message(() => normalizeRelations({ emails: { table: 't', on: {} } })),
    ).toBe('relations.emails.on must name at least one column pair');
    expect(
      message(() => normalizeRelations({ emails: { table: 't', on: 'id' } })),
    ).toBe('relations.emails.on must be an object');
    expect(
      message(() =>
        normalizeRelations({ emails: { table: 't', on: { contact_id: '' } } }),
      ),
    ).toBe('relations.emails.on.contact_id must be a non-empty string');
    expect(
      message(() =>
        normalizeRelations({
          emails: { table: 't', on: { a: 'b' }, fields: [] },
        }),
      ),
    ).toBe('relations.emails.fields must be an object');
    expect(
      message(() =>
        normalizeRelations({
          emails: {
            table: 't',
            on: { a: 'b' },
            fields: {
              n: { aggregate: { relation: 'x', fn: 'count' }, type: 'bigint' },
            },
          },
        }),
      ),
    ).toBe('relations.emails.fields.n must be a column field');
    expect(
      message(() =>
        normalizeRelations({ 'e mails': { table: 't', on: { a: 'b' } } }),
      ),
    ).toContain('a relation name must match');
  });
});
