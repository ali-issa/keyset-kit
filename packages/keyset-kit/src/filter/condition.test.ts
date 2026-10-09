import type { AggregateTarget } from '../plan/types';

import { describe, expect, it } from 'vitest';

import { age, firstName, lastName, unsupported } from '../test-support/filter';
import { definition } from '../test-support/fixtures';
import { normalizeFilter } from './normalize';

describe('conditionPredicate (scalars)', () => {
  it('maps comparisons to the column with a validated value', () => {
    expect(
      normalizeFilter(definition, {
        field: 'firstName',
        op: 'eq',
        value: 'Ada',
      }),
    ).toEqual({
      kind: 'compare',
      target: firstName,
      operator: '=',
      value: 'Ada',
    });
    expect(
      normalizeFilter(definition, { field: 'age', op: 'gte', value: '18' }),
    ).toEqual({
      kind: 'compare',
      target: age,
      operator: '>=',
      value: '18',
    });
    for (const [op, operator] of [
      ['ne', '!='],
      ['gt', '>'],
      ['lt', '<'],
      ['lte', '<='],
    ] as const) {
      expect(
        normalizeFilter(definition, { field: 'age', op, value: 1 }),
      ).toMatchObject({
        kind: 'compare',
        operator,
      });
    }
  });

  it('lowercases values of an insensitive field and compares through lower()', () => {
    expect(
      normalizeFilter(definition, {
        field: 'lastName',
        op: 'eq',
        value: 'Lovelace',
      }),
    ).toEqual({
      kind: 'compare',
      target: lastName,
      operator: '=',
      value: 'lovelace',
    });
    expect(
      normalizeFilter(definition, {
        field: 'lastName',
        op: 'in',
        value: ['A', 'B'],
      }),
    ).toEqual({
      kind: 'in',
      target: lastName,
      values: ['a', 'b'],
      negate: false,
    });
  });

  it('rejects unknown fields and operators the field does not accept', () => {
    expect(
      unsupported(() =>
        normalizeFilter(definition, { field: 'nope', op: 'eq', value: 1 }),
      ),
    ).toEqual({ field: 'nope', operator: null });
    expect(
      unsupported(() =>
        normalizeFilter(definition, {
          field: 'age',
          op: 'contains',
          value: '1',
        }),
      ),
    ).toEqual({ field: 'age', operator: 'contains' });
    expect(
      unsupported(() =>
        normalizeFilter(definition, {
          field: 'age',
          op: 'like' as never,
          value: '1',
        }),
      ),
    ).toEqual({ field: 'age', operator: 'like' });
    expect(
      unsupported(() =>
        normalizeFilter(
          definition,
          JSON.parse('{"field":"__proto__","op":"eq","value":1}'),
        ),
      ),
    ).toEqual({ field: '__proto__', operator: null });
  });

  it('filters on aggregate fields through the aggregate target', () => {
    const target: AggregateTarget = {
      kind: 'aggregate',
      relation: definition.relations.get('emails')!,
      fn: 'count',
      column: null,
      type: 'bigint',
    };
    expect(
      normalizeFilter(definition, { field: 'emailCount', op: 'gte', value: 2 }),
    ).toEqual({ kind: 'compare', target, operator: '>=', value: 2 });
    expect(
      normalizeFilter(definition, { field: 'latestStart', op: 'isNull' }),
    ).toEqual({
      kind: 'null',
      target: {
        kind: 'aggregate',
        relation: definition.relations.get('workHistory'),
        fn: 'max',
        column: 'start_date',
        type: 'date',
      },
      negate: false,
    });
    expect(
      unsupported(() =>
        normalizeFilter(definition, {
          field: 'emailCount',
          op: 'contains',
          value: '1',
        }),
      ),
    ).toEqual({ field: 'emailCount', operator: 'contains' });
  });
});
