/**
 * `defineKeyset` (SPEC 3): validates a definition once and returns the
 * object that plans requests and assembles pages. A mistake in the
 * definition is a `TypeError` naming the option, at the call, never at
 * request time.
 * @packageDocumentation
 */
import type { Page } from '../page/finish';
import type { KeysetRequest } from '../plan/plan';
import type { CursorValue, QueryPlan } from '../plan/types';
import type {
  FieldsInit,
  KeysetDefinition,
  KeysetInit,
  RelationFieldPath,
  RelationFieldsOf,
  RelationsInit,
  SearchSpec,
  SortableFieldOf,
  SortField,
} from './types';

import { createCursorCodec } from '../cursor/codec';
import { UnsupportedSortError } from '../errors';
import { isRecord } from '../internal/object';
import { finishPage } from '../page/finish';
import { createPlanner } from '../plan/plan';
import { resolveSortItems } from '../sort/resolve-sort';
import { isTextSearchMode } from './field-types';
import { assertIdentifier, normalizeFields } from './normalize-fields';
import { normalizeRelations } from './normalize-relations';

export const DEFAULT_PAGE_SIZE = 20;
export const DEFAULT_MAX_PAGE_SIZE = 100;
/** `regconfig` names a definition may use as text search configurations. */
const SEARCH_CONFIG = /^[a-z_][a-z0-9_]{0,62}$/u;

/** The relations type of a definition without relations. */
export type NoRelations = Readonly<Record<never, never>>;

/** The request a keyset with these fields and relations accepts. */
export type KeysetRequestOf<
  TFields extends FieldsInit,
  TRelations extends RelationsInit,
> = KeysetRequest<
  SortableFieldOf<TFields>,
  (keyof TFields & string) | RelationFieldPath<TRelations>,
  RelationFieldsOf<TRelations>
>;

export interface Keyset<
  TFields extends FieldsInit = FieldsInit,
  TRelations extends RelationsInit = RelationsInit,
> {
  readonly definition: KeysetDefinition;
  /** Validates the request and decodes its cursors into a plan. */
  plan(request: KeysetRequestOf<TFields, TRelations>): Promise<QueryPlan>;
  /**
   * Assembles the page from the rows an adapter fetched with the plan;
   * `values(row)` reads the row's sort-key values in `plan.keys` order.
   */
  page<TRow>(
    plan: QueryPlan,
    rows: ReadonlyArray<TRow>,
    values: (row: TRow) => ReadonlyArray<CursorValue>,
    options?: { readonly total?: number | undefined },
  ): Promise<Page<TRow>>;
}

function identifiers(what: string, value: unknown): ReadonlyArray<string> {
  if (!Array.isArray(value) || value.length === 0) {
    throw new TypeError(`${what} must be a non-empty array of names`);
  }
  return value.map((item: unknown, index) =>
    assertIdentifier(`${what}[${String(index)}]`, item),
  );
}

function normalizeSearch(init: unknown): SearchSpec | null {
  if (init === undefined) {
    return null;
  }
  if (!isRecord(init)) {
    throw new TypeError('search must be an object');
  }
  if (init['mode'] === 'like') {
    return {
      mode: 'like',
      columns: identifiers('search.columns', init['columns']),
    };
  }
  const mode = init['mode'] ?? 'websearch';
  if (!isTextSearchMode(mode)) {
    throw new TypeError(
      'search.mode must be websearch, plain, phrase, or like',
    );
  }
  const config = init['config'] ?? 'simple';
  if (typeof config !== 'string' || !SEARCH_CONFIG.test(config)) {
    throw new TypeError(`search.config must match ${SEARCH_CONFIG.source}`);
  }
  if (init['vector'] !== undefined && init['columns'] !== undefined) {
    throw new TypeError('search takes either columns or vector, not both');
  }
  const source =
    init['vector'] === undefined
      ? { columns: identifiers('search.columns', init['columns']) }
      : { vector: assertIdentifier('search.vector', init['vector']) };
  return { mode, source, config };
}

function positiveInteger(
  what: string,
  value: unknown,
  fallback: number,
): number {
  if (value === undefined) {
    return fallback;
  }
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
    throw new TypeError(`${what} must be a positive integer`);
  }
  return value;
}

function normalizePage(init: unknown): KeysetDefinition['page'] {
  if (init !== undefined && !isRecord(init)) {
    throw new TypeError('page must be an object');
  }
  const page = init ?? {};
  const max = positiveInteger('page.max', page['max'], DEFAULT_MAX_PAGE_SIZE);
  const fallback = Math.min(DEFAULT_PAGE_SIZE, max);
  const defaultSize = positiveInteger(
    'page.default',
    page['default'],
    fallback,
  );
  if (defaultSize > max) {
    throw new TypeError('page.default must not exceed page.max');
  }
  const range = page['range'] ?? false;
  if (typeof range !== 'boolean') {
    throw new TypeError('page.range must be a boolean');
  }
  return { default: defaultSize, max, range };
}

function normalizeKey(
  key: unknown,
  fields: KeysetDefinition['fields'],
): ReadonlyArray<string> {
  const names = identifiers('key', key);
  if (new Set(names).size !== names.length) {
    throw new TypeError('key must not repeat a field');
  }
  for (const name of names) {
    const field = fields.get(name);
    const usable =
      field?.kind === 'column' &&
      field.type !== 'array' &&
      !field.nullable &&
      field.sortable;
    if (!usable) {
      throw new TypeError(
        `key must name declared, sortable, non-nullable column fields: ${JSON.stringify(name)}`,
      );
    }
  }
  return names;
}

function normalizeDefaultSort(
  definition: Omit<KeysetDefinition, 'sort'>,
  init: unknown,
): ReadonlyArray<SortField> {
  if (init !== undefined && !isRecord(init)) {
    throw new TypeError('sort must be an object');
  }
  const requested = init?.['default'];
  if (requested === undefined) {
    return definition.key.map((field) => ({ field, direction: 'asc' }));
  }
  if (!Array.isArray(requested)) {
    throw new TypeError('sort.default must be an array');
  }
  const items: ReadonlyArray<unknown> = requested;
  try {
    return resolveSortItems({ ...definition, sort: { default: [] } }, items);
  } catch (error) {
    if (error instanceof UnsupportedSortError) {
      throw new TypeError(
        `sort.default names fields that are not sortable: ${error.fields.join(', ')}`,
        { cause: error },
      );
    }
    throw error;
  }
}

/** Validates `init` (a `TypeError` names the option) and returns the keyset. */
export function defineKeyset<
  const TFields extends FieldsInit,
  const TRelations extends RelationsInit = NoRelations,
>(init: KeysetInit<TFields, TRelations>): Keyset<TFields, TRelations> {
  if (!isRecord(init)) {
    throw new TypeError('defineKeyset requires an object');
  }
  const table = assertIdentifier('table', init.table);
  const relations = normalizeRelations(init.relations);
  const fields = normalizeFields(init.fields, relations);
  const key = normalizeKey(init.key, fields);
  const search = normalizeSearch(init.search);
  const page = normalizePage(init.page);
  if (!isRecord(init.cursor)) {
    throw new TypeError('cursor must be an object');
  }
  const codec = createCursorCodec(init.cursor);
  const partial = {
    table,
    key,
    fields,
    relations,
    search,
    page,
    cursor: { ttl: init.cursor.ttl ?? null },
  };
  const definition: KeysetDefinition = {
    ...partial,
    sort: { default: normalizeDefaultSort(partial, init.sort) },
  };
  const plan = createPlanner(definition, codec);
  return {
    definition,
    plan,
    page: async (queryPlan, rows, values, options) =>
      finishPage(queryPlan, codec, rows, values, options),
  };
}
