import { describe, expect, it } from 'vitest';

import {
  isAggregateFieldType,
  isAggregateFunction,
  isArrayElementType,
  isCollation,
  isFieldType,
  isScalarFieldType,
  isTextSearchMode,
  SCALAR_FIELD_TYPES,
} from './field-types';

describe('field type vocabularies', () => {
  it('knows the twelve scalar types and array', () => {
    expect(SCALAR_FIELD_TYPES).toHaveLength(12);
    for (const type of SCALAR_FIELD_TYPES) {
      expect(isScalarFieldType(type)).toBe(true);
      expect(isFieldType(type)).toBe(true);
    }
    expect(isFieldType('array')).toBe(true);
    expect(isScalarFieldType('array')).toBe(false);
    expect(isFieldType('json')).toBe(false);
    expect(isFieldType(1)).toBe(false);
  });

  it('excludes enum from array elements and boolean, uuid, enum from aggregates', () => {
    expect(isArrayElementType('text')).toBe(true);
    expect(isArrayElementType('enum')).toBe(false);
    expect(isAggregateFieldType('bigint')).toBe(true);
    expect(isAggregateFieldType('boolean')).toBe(false);
    expect(isAggregateFieldType('uuid')).toBe(false);
    expect(isAggregateFieldType('enum')).toBe(false);
  });

  it('recognises aggregate functions, search modes, and collations', () => {
    expect(isAggregateFunction('avg')).toBe(true);
    expect(isAggregateFunction('median')).toBe(false);
    expect(isTextSearchMode('phrase')).toBe(true);
    expect(isTextSearchMode('like')).toBe(false);
    expect(isCollation('insensitive')).toBe(true);
    expect(isCollation('en_US')).toBe(false);
  });
});
