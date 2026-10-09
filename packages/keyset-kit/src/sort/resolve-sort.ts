/**
 * Sort resolution (SPEC 5): request sort fields are checked against the
 * definition, and the key is appended as the tie-breaker so the order is
 * total. The profile requires an order that is unique per item; without
 * the key, equal values would make pages overlap or skip rows.
 * @ref https://jsonapi.org/profiles/ethanresnick/cursor-pagination/#auto-id--concepts (sorting)
 * @ref https://www.postgresql.org/docs/current/queries-order.html
 * @packageDocumentation
 */
import type {
  KeysetDefinition,
  SortField,
  SortInput,
} from '../definition/types';

import { UnsupportedSortError } from '../errors';
import { describe, isRecord } from '../internal/object';

type Parsed =
  | { readonly ok: true; readonly sort: SortField }
  | { readonly ok: false; readonly label: string };

/** Parses `'name'`, `'-name'`, or `{ field, direction }`. */
function parseSortInput(input: unknown): Parsed {
  if (typeof input === 'string') {
    const sort: SortField = input.startsWith('-')
      ? { field: input.slice(1), direction: 'desc' }
      : { field: input, direction: 'asc' };
    return { ok: true, sort };
  }
  if (!isRecord(input) || typeof input['field'] !== 'string') {
    return { ok: false, label: describe(input) };
  }
  const direction = input['direction'];
  if (direction !== 'asc' && direction !== 'desc') {
    return { ok: false, label: input['field'] };
  }
  return { ok: true, sort: { field: input['field'], direction } };
}

/**
 * Resolves unchecked sort items: the validated fields, with every key
 * field not already named appended ascending. Throws
 * `UnsupportedSortError` listing every item that is unknown, not
 * sortable, repeated, or malformed.
 */
export function resolveSortItems(
  definition: KeysetDefinition,
  items: ReadonlyArray<unknown>,
): Array<SortField> {
  const sort: Array<SortField> = [];
  const rejected: Array<string> = [];
  const seen = new Set<string>();
  for (const item of items) {
    const parsed = parseSortInput(item);
    if (!parsed.ok) {
      rejected.push(parsed.label);
      continue;
    }
    const { field: name } = parsed.sort;
    const field = definition.fields.get(name);
    if (field === undefined || !field.sortable || seen.has(name)) {
      rejected.push(name);
      continue;
    }
    seen.add(name);
    sort.push(parsed.sort);
  }
  if (rejected.length > 0) {
    throw new UnsupportedSortError(rejected);
  }
  for (const key of definition.key) {
    if (!seen.has(key)) {
      sort.push({ field: key, direction: 'asc' });
    }
  }
  return sort;
}

/** The request's sort (the definition's default when absent), resolved. */
export function resolveSort(
  definition: KeysetDefinition,
  input?: ReadonlyArray<SortInput>,
): Array<SortField> {
  return resolveSortItems(definition, input ?? definition.sort.default);
}

/** `-createdAt,id`: the text form a cursor is bound to. */
export function sortSignature(sort: ReadonlyArray<SortField>): string {
  return sort
    .map((item) => (item.direction === 'desc' ? `-${item.field}` : item.field))
    .join(',');
}
