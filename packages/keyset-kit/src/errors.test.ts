import { describe, expect, it } from 'vitest';

import {
  InvalidCursorError,
  InvalidFilterError,
  InvalidFilterValueError,
  InvalidPageSizeError,
  isKeysetError,
  KeysetError,
  PageSizeExceededError,
  RangeNotSupportedError,
  UnsupportedFilterError,
  UnsupportedSearchError,
  UnsupportedSortError,
} from './errors';

describe('request errors', () => {
  it.each([
    [new InvalidCursorError('after', 'expired'), 'INVALID_CURSOR'],
    [new UnsupportedSortError(['x']), 'UNSUPPORTED_SORT'],
    [new UnsupportedFilterError('x'), 'UNSUPPORTED_FILTER'],
    [new InvalidFilterError(['and', 0]), 'INVALID_FILTER'],
    [new InvalidFilterValueError('x', 'eq', 'text'), 'INVALID_FILTER_VALUE'],
    [new UnsupportedSearchError(), 'UNSUPPORTED_SEARCH'],
    [new InvalidPageSizeError('ten'), 'INVALID_PAGE_SIZE'],
    [new PageSizeExceededError(500, 100), 'PAGE_SIZE_EXCEEDED'],
    [new RangeNotSupportedError(), 'RANGE_NOT_SUPPORTED'],
  ])('%s carries code %s and the class name', (error, code) => {
    expect(error).toBeInstanceOf(KeysetError);
    expect(error).toBeInstanceOf(Error);
    expect(error.code).toBe(code);
    expect(error.name).toBe(error.constructor.name);
    expect(isKeysetError(error)).toBe(true);
  });

  it('keeps request values out of the message', () => {
    const error = new InvalidFilterValueError('secretField', 'eq', 'text');
    expect(error.message).not.toContain('secretField');
    expect(error.field).toBe('secretField');
    expect(error.operator).toBe('eq');
    expect(error.expected).toBe('text');
  });

  it('exposes the structured details', () => {
    const cursor = new InvalidCursorError('before', 'context');
    expect(cursor.parameter).toBe('before');
    expect(cursor.reason).toBe('context');
    expect(new UnsupportedSortError(['a', 'b']).fields).toEqual(['a', 'b']);
    const filter = new UnsupportedFilterError('age');
    expect(filter.operator).toBeNull();
    expect(new UnsupportedFilterError('age', 'contains').operator).toBe(
      'contains',
    );
    expect(new InvalidFilterError(['or', 2, 'not']).path).toEqual([
      'or',
      2,
      'not',
    ]);
    expect(new InvalidPageSizeError(0).requested).toBe(0);
    const size = new PageSizeExceededError(500, 100);
    expect(size.requested).toBe(500);
    expect(size.max).toBe(100);
  });

  it('does not treat other errors as keyset errors', () => {
    expect(isKeysetError(new TypeError('x'))).toBe(false);
    expect(isKeysetError({ code: 'INVALID_CURSOR' })).toBe(false);
  });
});
