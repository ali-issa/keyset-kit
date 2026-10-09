import type { Kysely } from 'kysely';

import type { AggregateTarget, Target } from 'keyset-kit';

import type { AnyDatabase } from '../types';

import { describe, expect, it } from 'vitest';

import { compileOnly } from '../test-support/db';
import { contacts } from '../test-support/keysets';
import { renderTarget } from './target';

const db = compileOnly() as unknown as Kysely<AnyDatabase>;
const context = { table: 'contacts' };

function compile(target: Target): string {
  return db
    .selectFrom('contacts')
    .select((eb) => renderTarget(eb, target, context).as('x'))
    .compile().sql;
}

describe('renderTarget', () => {
  it('references a column as table.column', () => {
    expect(
      compile({
        kind: 'column',
        table: 'contacts',
        column: 'first_name',
        type: 'text',
        lower: false,
      }),
    ).toBe('select "contacts"."first_name" as "x" from "contacts"');
  });

  it('wraps an insensitive column in lower()', () => {
    expect(
      compile({
        kind: 'column',
        table: 'contacts',
        column: 'last_name',
        type: 'text',
        lower: true,
      }),
    ).toBe('select lower("contacts"."last_name") as "x" from "contacts"');
  });

  it('renders a count aggregate as a correlated scalar subquery', () => {
    const relation = contacts.definition.relations.get('emails');
    const target: AggregateTarget = {
      kind: 'aggregate',
      relation: relation!,
      fn: 'count',
      column: null,
      type: 'bigint',
    };
    expect(compile(target)).toBe(
      'select (select count(*) as "value" from "contact_emails" where "contact_emails"."contact_id" = "contacts"."id") as "x" from "contacts"',
    );
  });

  it('renders a column aggregate with every join pair', () => {
    const relation = contacts.definition.relations.get('workHistory');
    const target: AggregateTarget = {
      kind: 'aggregate',
      relation: {
        ...relation!,
        on: [
          ['contact_id', 'id'],
          ['tenant', 'tenant'],
        ],
      },
      fn: 'max',
      column: 'start_date',
      type: 'date',
    };
    expect(compile(target)).toBe(
      'select (select max("work_history"."start_date") as "value" from "work_history" where "work_history"."contact_id" = "contacts"."id" and "work_history"."tenant" = "contacts"."tenant") as "x" from "contacts"',
    );
  });

  it('joins search columns with concat_ws', () => {
    expect(
      compile({
        kind: 'concat',
        table: 'contacts',
        columns: ['first_name', 'last_name'],
      }),
    ).toBe(
      `select concat_ws(' ', "contacts"."first_name", "contacts"."last_name") as "x" from "contacts"`,
    );
  });
});
