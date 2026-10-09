import { describe, expect, it } from 'vitest';

import {
  age,
  column,
  invalidValue,
  tags,
  unsupported,
} from '../test-support/filter';
import { definition } from '../test-support/fixtures';
import { normalizeFilter } from './normalize';

describe('conditionPredicate (lists and nulls)', () => {
  it('maps membership, with an empty list folding to a constant', () => {
    expect(
      normalizeFilter(definition, {
        field: 'status',
        op: 'in',
        value: ['lead'],
      }),
    ).toEqual({
      kind: 'in',
      target: column('status', 'enum'),
      values: ['lead'],
      negate: false,
    });
    expect(
      normalizeFilter(definition, { field: 'age', op: 'nin', value: [1, 2] }),
    ).toEqual({
      kind: 'in',
      target: age,
      values: [1, 2],
      negate: true,
    });
    expect(
      normalizeFilter(definition, { field: 'age', op: 'in', value: [] }),
    ).toEqual({
      kind: 'literal',
      value: false,
    });
    expect(
      normalizeFilter(definition, { field: 'age', op: 'nin', value: [] }),
    ).toEqual({
      kind: 'literal',
      value: true,
    });
    expect(
      invalidValue(() =>
        normalizeFilter(definition, { field: 'age', op: 'in', value: 1 }),
      ),
    ).toBe('an array of values');
    expect(
      invalidValue(() =>
        normalizeFilter(definition, {
          field: 'status',
          op: 'in',
          value: ['vip'],
        }),
      ),
    ).toBe('one of "lead", "customer"');
  });

  it('maps between with exactly two values', () => {
    expect(
      normalizeFilter(definition, {
        field: 'birthday',
        op: 'between',
        value: ['2000-01-01', '2000-12-31'],
      }),
    ).toEqual({
      kind: 'between',
      target: column('birthday', 'date'),
      low: '2000-01-01',
      high: '2000-12-31',
    });
    expect(
      invalidValue(() =>
        normalizeFilter(definition, {
          field: 'age',
          op: 'between',
          value: [1],
        }),
      ),
    ).toBe('[low, high]');
    expect(
      invalidValue(() =>
        normalizeFilter(definition, {
          field: 'age',
          op: 'between',
          value: [1, 2, 3],
        }),
      ),
    ).toBe('[low, high]');
  });

  it('maps isNull on nullable fields, true by default', () => {
    expect(normalizeFilter(definition, { field: 'age', op: 'isNull' })).toEqual(
      {
        kind: 'null',
        target: age,
        negate: false,
      },
    );
    expect(
      normalizeFilter(definition, { field: 'age', op: 'isNull', value: false }),
    ).toEqual({
      kind: 'null',
      target: age,
      negate: true,
    });
    expect(
      unsupported(() =>
        normalizeFilter(definition, { field: 'firstName', op: 'isNull' }),
      ),
    ).toEqual({ field: 'firstName', operator: 'isNull' });
    expect(
      invalidValue(() =>
        normalizeFilter(definition, {
          field: 'age',
          op: 'isNull',
          value: 'yes',
        }),
      ),
    ).toBe('boolean');
  });

  it('maps array containment with values of the element type', () => {
    expect(
      normalizeFilter(definition, {
        field: 'tags',
        op: 'contains',
        value: ['a', 'b'],
      }),
    ).toEqual({
      kind: 'array',
      target: tags,
      operator: 'contains',
      values: ['a', 'b'],
    });
    expect(
      normalizeFilter(definition, {
        field: 'tags',
        op: 'overlaps',
        value: ['a'],
      }),
    ).toMatchObject({ operator: 'overlaps' });
    expect(
      normalizeFilter(definition, {
        field: 'tags',
        op: 'containedBy',
        value: [],
      }),
    ).toMatchObject({ operator: 'containedBy', values: [] });
    expect(
      invalidValue(() =>
        normalizeFilter(definition, {
          field: 'tags',
          op: 'contains',
          value: 'a',
        }),
      ),
    ).toBe('an array of values');
    expect(
      invalidValue(() =>
        normalizeFilter(definition, {
          field: 'tags',
          op: 'contains',
          value: [1],
        }),
      ),
    ).toBe('text');
    expect(
      unsupported(() =>
        normalizeFilter(definition, { field: 'tags', op: 'eq', value: 'a' }),
      ),
    ).toEqual({ field: 'tags', operator: 'eq' });
  });
});
