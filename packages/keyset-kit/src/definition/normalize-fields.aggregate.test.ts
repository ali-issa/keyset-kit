import { describe, expect, it } from 'vitest';

import { operatorsFor } from '../filter/operators';
import { thrown } from '../test-support/fixtures';
import { normalizeFields } from './normalize-fields';
import { normalizeRelations } from './normalize-relations';

const RELATIONS = normalizeRelations({
  emails: { table: 'contact_emails', on: { contact_id: 'id' } },
});

function message(fn: () => unknown): string {
  const error = thrown(fn);
  expect(error).toBeInstanceOf(TypeError);
  return (error as TypeError).message;
}

describe('normalizeFields (aggregates)', () => {
  it('normalizes a count and a max over a declared relation', () => {
    const fields = normalizeFields(
      {
        emailCount: {
          aggregate: { relation: 'emails', fn: 'count' },
          type: 'bigint',
        },
        latest: {
          aggregate: { relation: 'emails', fn: 'max', column: 'created_at' },
          type: 'timestamptz',
          sortable: false,
        },
      },
      RELATIONS,
    );
    expect(fields.get('emailCount')).toEqual({
      kind: 'aggregate',
      name: 'emailCount',
      relation: 'emails',
      fn: 'count',
      column: null,
      type: 'bigint',
      nullable: false,
      sortable: true,
      operators: operatorsFor('bigint', false),
    });
    expect(fields.get('latest')).toMatchObject({
      column: 'created_at',
      nullable: true,
      sortable: false,
    });
    expect(fields.get('latest')?.operators.has('isNull')).toBe(true);
  });

  it('checks the relation, the function, the column, and the type', () => {
    expect(
      message(() =>
        normalizeFields(
          {
            n: {
              aggregate: { relation: 'phones', fn: 'count' },
              type: 'bigint',
            },
          },
          RELATIONS,
        ),
      ),
    ).toBe(
      'fields.n.aggregate.relation names an undeclared relation: "phones"',
    );
    expect(
      message(() =>
        normalizeFields(
          {
            n: {
              aggregate: { relation: 'emails', fn: 'median' },
              type: 'bigint',
            },
          },
          RELATIONS,
        ),
      ),
    ).toBe('fields.n.aggregate.fn must be count, max, min, sum, or avg');
    expect(
      message(() =>
        normalizeFields(
          { n: { aggregate: { relation: 'emails', fn: 'max' }, type: 'date' } },
          RELATIONS,
        ),
      ),
    ).toBe('fields.n.aggregate.column is required for max');
    expect(
      message(() =>
        normalizeFields(
          {
            n: {
              aggregate: { relation: 'emails', fn: 'count' },
              type: 'boolean',
            },
          },
          RELATIONS,
        ),
      ),
    ).toBe('fields.n.type is not an aggregate field type: "boolean"');
    expect(
      message(() =>
        normalizeFields(
          { n: { aggregate: 'emails', type: 'bigint' } },
          RELATIONS,
        ),
      ),
    ).toBe('fields.n.aggregate must be an object');
  });

  it('gives a text aggregate the operators of its type without the patterns', () => {
    const fields = normalizeFields(
      {
        lastEmail: {
          aggregate: { relation: 'emails', fn: 'max', column: 'email' },
          type: 'text',
        },
      },
      RELATIONS,
    );
    const operators = fields.get('lastEmail')?.operators;
    expect(operators?.has('eq')).toBe(true);
    expect(operators?.has('gt')).toBe(true);
    expect(operators?.has('isNull')).toBe(true);
    expect(operators?.has('contains')).toBe(false);
    expect(operators?.has('eqi')).toBe(false);
    expect(
      message(() =>
        normalizeFields(
          {
            lastEmail: {
              aggregate: { relation: 'emails', fn: 'max', column: 'email' },
              type: 'text',
              operators: ['contains'],
            },
          },
          RELATIONS,
        ),
      ),
    ).toBe(
      'fields.lastEmail.operators contains an operator the field\'s type does not accept: "contains"',
    );
  });
});
