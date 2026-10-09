import { describe, expect, it } from 'vitest';

import { UnsupportedSortError } from '../errors';
import { definition, thrown } from '../test-support/fixtures';
import { resolveSort, resolveSortItems, sortSignature } from './resolve-sort';

function rejectedFields(fn: () => unknown): ReadonlyArray<string> {
  const error = thrown(fn);
  expect(error).toBeInstanceOf(UnsupportedSortError);
  return (error as UnsupportedSortError).fields;
}

describe('resolveSort', () => {
  it('uses the default sort when the request has none', () => {
    expect(resolveSort(definition)).toEqual([
      { field: 'id', direction: 'asc' },
    ]);
  });

  it('parses prefixed strings and objects, then appends the key ascending', () => {
    expect(
      resolveSort(definition, [
        '-createdAt',
        { field: 'age', direction: 'desc' },
        'firstName',
      ]),
    ).toEqual([
      { field: 'createdAt', direction: 'desc' },
      { field: 'age', direction: 'desc' },
      { field: 'firstName', direction: 'asc' },
      { field: 'id', direction: 'asc' },
    ]);
  });

  it('keeps a key field where and how the request placed it', () => {
    expect(resolveSort(definition, ['-id', 'age'])).toEqual([
      { field: 'id', direction: 'desc' },
      { field: 'age', direction: 'asc' },
    ]);
  });

  it('accepts aggregate fields', () => {
    expect(resolveSort(definition, ['-emailCount'])[0]).toEqual({
      field: 'emailCount',
      direction: 'desc',
    });
  });

  it('lists every unknown, unsortable, repeated, or malformed item', () => {
    expect(
      rejectedFields(() =>
        resolveSortItems(definition, [
          'nope',
          'bio',
          'tags',
          'age',
          '-age',
          { field: 'age', direction: 'up' },
          { field: 1 },
          42,
          'createdAt',
        ]),
      ),
    ).toEqual(['nope', 'bio', 'tags', 'age', 'age', '{"field":1}', '42']);
  });

  it('rejects a prototype name without touching the prototype', () => {
    expect(
      rejectedFields(() => resolveSort(definition, ['__proto__'])),
    ).toEqual(['__proto__']);
  });
});

describe('sortSignature', () => {
  it('writes the sort as the request would', () => {
    expect(
      sortSignature([
        { field: 'createdAt', direction: 'desc' },
        { field: 'id', direction: 'asc' },
      ]),
    ).toBe('-createdAt,id');
  });
});
