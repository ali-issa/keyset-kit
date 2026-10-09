import { describe, expect, it } from 'vitest';

import { firstName, invalidValue, lastName } from '../test-support/filter';
import { definition } from '../test-support/fixtures';
import { normalizeFilter } from './normalize';

describe('conditionPredicate (patterns)', () => {
  it('maps patterns with escaped wildcards; the i suffix means ILIKE', () => {
    expect(
      normalizeFilter(definition, {
        field: 'firstName',
        op: 'contains',
        value: '50%_a\\',
      }),
    ).toEqual({
      kind: 'like',
      target: firstName,
      pattern: '%50\\%\\_a\\\\%',
      caseInsensitive: false,
    });
    expect(
      normalizeFilter(definition, {
        field: 'firstName',
        op: 'startsWithi',
        value: 'Ad',
      }),
    ).toMatchObject({ pattern: 'Ad%', caseInsensitive: true });
    expect(
      normalizeFilter(definition, {
        field: 'firstName',
        op: 'endsWith',
        value: 'da',
      }),
    ).toMatchObject({ pattern: '%da', caseInsensitive: false });
    expect(
      normalizeFilter(definition, {
        field: 'firstName',
        op: 'eqi',
        value: 'ADA',
      }),
    ).toMatchObject({ pattern: 'ADA', caseInsensitive: true });
    expect(
      normalizeFilter(definition, {
        field: 'firstName',
        op: 'containsi',
        value: 'd',
      }),
    ).toMatchObject({ pattern: '%d%', caseInsensitive: true });
    expect(
      normalizeFilter(definition, {
        field: 'firstName',
        op: 'endsWithi',
        value: 'd',
      }),
    ).toMatchObject({ pattern: '%d', caseInsensitive: true });
    expect(
      invalidValue(() =>
        normalizeFilter(definition, {
          field: 'firstName',
          op: 'contains',
          value: 1,
        }),
      ),
    ).toBe('text');
  });

  it('matches patterns on an insensitive field case-insensitively without lower()', () => {
    expect(
      normalizeFilter(definition, {
        field: 'lastName',
        op: 'startsWith',
        value: 'Lo',
      }),
    ).toEqual({
      kind: 'like',
      target: { ...lastName, lower: false },
      pattern: 'Lo%',
      caseInsensitive: true,
    });
  });
});
