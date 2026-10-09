/**
 * Page request resolution (SPEC 7.1): the used page size and the cursors,
 * checked against the definition's bounds, as the Cursor Pagination
 * profile prescribes.
 * @ref https://jsonapi.org/profiles/ethanresnick/cursor-pagination/#auto-id--query-parameters
 * @packageDocumentation
 */
import type { KeysetDefinition } from '../definition/types';

import {
  InvalidCursorError,
  InvalidPageSizeError,
  PageSizeExceededError,
  RangeNotSupportedError,
} from '../errors';

export interface PageInput {
  readonly size?: number | undefined;
  readonly after?: string | undefined;
  readonly before?: string | undefined;
}

export interface ResolvedPage {
  /** The used page size. */
  readonly size: number;
  readonly after: string | null;
  readonly before: string | null;
  readonly range: boolean;
}

function cursorInput(
  value: unknown,
  parameter: 'after' | 'before',
): string | null {
  if (value === undefined) {
    return null;
  }
  // An empty string is not a valid cursor: "If their value is not a valid
  // cursor, the server MUST respond according to the rules for the invalid
  // query parameter error."
  if (typeof value !== 'string' || value.length === 0) {
    throw new InvalidCursorError(parameter, 'malformed');
  }
  return value;
}

export function resolvePage(
  definition: KeysetDefinition,
  input?: PageInput,
): ResolvedPage {
  const after = cursorInput(input?.after, 'after');
  const before = cursorInput(input?.before, 'before');
  const range = after !== null && before !== null;
  if (range && !definition.page.range) {
    throw new RangeNotSupportedError();
  }
  const requested = input?.size;
  if (requested === undefined) {
    // "On range pagination requests, the server MUST use its max page size
    // for that endpoint as the default page size."
    return {
      size: range ? definition.page.max : definition.page.default,
      after,
      before,
      range,
    };
  }
  // "If page[size] is provided, it MUST be a positive integer."
  if (
    typeof requested !== 'number' ||
    !Number.isInteger(requested) ||
    requested < 1
  ) {
    throw new InvalidPageSizeError(requested);
  }
  if (requested > definition.page.max) {
    throw new PageSizeExceededError(requested, definition.page.max);
  }
  return { size: requested, after, before, range };
}
