/**
 * Helpers for the filter tests: column targets of the shared fixture and
 * readers of the structured error fields.
 */
import type { ColumnTarget } from '../plan/types';

import { expect } from 'vitest';

import {
  InvalidFilterError,
  InvalidFilterValueError,
  UnsupportedFilterError,
} from '../errors';
import { thrown } from './fixtures';

export function column(
  name: string,
  type: ColumnTarget['type'],
  table = 'contacts',
  lower = false,
): ColumnTarget {
  return { kind: 'column', table, column: name, type, lower };
}

export const firstName: ColumnTarget = column('first_name', 'text');
export const lastName: ColumnTarget = column(
  'last_name',
  'text',
  'contacts',
  true,
);
export const age: ColumnTarget = column('age', 'integer');
export const tags: ColumnTarget = column('tags', 'array');

export function unsupported(fn: () => unknown): {
  field: string;
  operator: string | null;
} {
  const error = thrown(fn);
  expect(error).toBeInstanceOf(UnsupportedFilterError);
  const { field, operator } = error as UnsupportedFilterError;
  return { field, operator };
}

export function invalidValue(fn: () => unknown): string {
  const error = thrown(fn);
  expect(error).toBeInstanceOf(InvalidFilterValueError);
  return (error as InvalidFilterValueError).expected;
}

export function invalidPath(fn: () => unknown): ReadonlyArray<string | number> {
  const error = thrown(fn);
  expect(error).toBeInstanceOf(InvalidFilterError);
  return (error as InvalidFilterError).path;
}
