import { describe, expect, it } from 'vitest';

import { defineKeyset } from '../definition/define-keyset';
import {
  InvalidCursorError,
  InvalidPageSizeError,
  PageSizeExceededError,
  RangeNotSupportedError,
} from '../errors';
import { CONTACTS, definition, thrown } from '../test-support/fixtures';
import { resolvePage } from './page-request';

const NO_RANGE = defineKeyset({
  ...CONTACTS,
  page: { default: 10, max: 50 },
}).definition;

describe('resolvePage', () => {
  it('uses the default size and no cursors for an empty request', () => {
    expect(resolvePage(definition)).toEqual({
      size: 20,
      after: null,
      before: null,
      range: false,
    });
    expect(resolvePage(definition, {})).toEqual({
      size: 20,
      after: null,
      before: null,
      range: false,
    });
  });

  it('accepts a size within the max and the cursors as given', () => {
    expect(resolvePage(definition, { size: 100, after: 'a' })).toEqual({
      size: 100,
      after: 'a',
      before: null,
      range: false,
    });
    expect(resolvePage(definition, { before: 'b' })).toMatchObject({
      before: 'b',
      range: false,
    });
  });

  // "If page[size] is provided, it MUST be a positive integer."
  it.each([0, -1, 1.5, '10', Number.NaN, null])(
    'rejects %j as a page size',
    (size) => {
      const error = thrown(() =>
        resolvePage(definition, { size: size as never }),
      );
      expect(error).toBeInstanceOf(InvalidPageSizeError);
      expect((error as InvalidPageSizeError).requested).toBe(size);
    },
  );

  it('rejects a size above the max with the max in the error', () => {
    const error = thrown(() => resolvePage(NO_RANGE, { size: 51 }));
    expect(error).toBeInstanceOf(PageSizeExceededError);
    expect(error).toMatchObject({ requested: 51, max: 50 });
  });

  it('defaults a range request to the max page size', () => {
    expect(resolvePage(definition, { after: 'a', before: 'b' })).toEqual({
      size: 100,
      after: 'a',
      before: 'b',
      range: true,
    });
    expect(
      resolvePage(definition, { after: 'a', before: 'b', size: 5 }).size,
    ).toBe(5);
  });

  it('rejects a range request when the definition does not allow it', () => {
    expect(
      thrown(() => resolvePage(NO_RANGE, { after: 'a', before: 'b' })),
    ).toBeInstanceOf(RangeNotSupportedError);
  });

  it('treats an empty or non-string cursor as malformed', () => {
    const empty = thrown(() => resolvePage(definition, { after: '' }));
    expect(empty).toBeInstanceOf(InvalidCursorError);
    expect(empty).toMatchObject({ parameter: 'after', reason: 'malformed' });
    const wrong = thrown(() => resolvePage(definition, { before: 1 as never }));
    expect(wrong).toMatchObject({ parameter: 'before', reason: 'malformed' });
  });
});
