import { describe, expect, it } from 'vitest';

import {
  comparisonOf,
  isArrayOperator,
  isOperator,
  isPatternOperator,
  OPERATORS,
  operatorsFor,
} from './operators';

describe('operatorsFor', () => {
  it('gives text fields equality, membership, ordering, and patterns', () => {
    expect([...operatorsFor('text', false)]).toEqual([
      'eq',
      'ne',
      'in',
      'nin',
      'gt',
      'gte',
      'lt',
      'lte',
      'between',
      'contains',
      'startsWith',
      'endsWith',
      'eqi',
      'containsi',
      'startsWithi',
      'endsWithi',
    ]);
  });

  it('limits booleans to equality and uuids and enums to equality and membership', () => {
    expect([...operatorsFor('boolean', false)]).toEqual(['eq', 'ne']);
    expect([...operatorsFor('uuid', false)]).toEqual(['eq', 'ne', 'in', 'nin']);
    expect([...operatorsFor('enum', false)]).toEqual(['eq', 'ne', 'in', 'nin']);
  });

  it('gives numbers and temporals ordering but no patterns', () => {
    for (const type of [
      'integer',
      'bigint',
      'decimal',
      'float',
      'date',
      'time',
      'timestamp',
      'timestamptz',
    ] as const) {
      const operators = operatorsFor(type, false);
      expect(operators.has('between')).toBe(true);
      expect(operators.has('contains')).toBe(false);
    }
  });

  it('gives arrays the containment operators only', () => {
    expect([...operatorsFor('array', false)]).toEqual([
      'contains',
      'containedBy',
      'overlaps',
    ]);
  });

  it('adds isNull for nullable fields only', () => {
    expect(operatorsFor('integer', false).has('isNull')).toBe(false);
    expect(operatorsFor('integer', true).has('isNull')).toBe(true);
  });
});

describe('operator classification', () => {
  it('lists every operator once', () => {
    expect(OPERATORS).toHaveLength(19);
    expect(new Set(OPERATORS).size).toBe(OPERATORS.length);
    for (const op of OPERATORS) {
      expect(isOperator(op)).toBe(true);
    }
    expect(isOperator('like')).toBe(false);
    expect(isOperator(1)).toBe(false);
  });

  it('separates patterns, array operators, and comparisons', () => {
    expect(isPatternOperator('containsi')).toBe(true);
    expect(isPatternOperator('eq')).toBe(false);
    expect(isArrayOperator('overlaps')).toBe(true);
    expect(isArrayOperator('contains')).toBe(true);
    expect(isArrayOperator('in')).toBe(false);
    expect(comparisonOf('gte')).toBe('>=');
    expect(comparisonOf('ne')).toBe('!=');
    expect(comparisonOf('between')).toBeUndefined();
  });
});
