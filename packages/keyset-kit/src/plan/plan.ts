/**
 * The planner (SPEC 6.1): one request becomes one `QueryPlan`. Validation
 * runs in the order a client would want to hear about problems: sort,
 * filter, search, page size, then cursors (which need the context the
 * first three define).
 * @ref https://jsonapi.org/profiles/ethanresnick/cursor-pagination/
 * @packageDocumentation
 */
import type { CursorCodec } from '../cursor/codec';
import type {
  KeysetDefinition,
  SortDirection,
  SortInput,
} from '../definition/types';
import type { Filter, RelationFieldMap } from '../filter/types';
import type { PageInput } from '../page/page-request';
import type { CursorValue, PlanKey, Predicate, QueryPlan } from './types';

import { InvalidCursorError, UnsupportedSearchError } from '../errors';
import { targetOf } from '../filter/condition';
import { normalizeFilter } from '../filter/normalize';
import { canonicalJson } from '../internal/canonical';
import { sha256Base64Url } from '../internal/crypto';
import { escapeLike } from '../internal/like';
import { resolvePage } from '../page/page-request';
import { resolveSort, sortSignature } from '../sort/resolve-sort';
import { seekPredicate } from './seek';

export interface KeysetRequest<
  TSort extends string = string,
  TFilter extends string = string,
  TRelationFields extends RelationFieldMap = RelationFieldMap,
> {
  readonly sort?: ReadonlyArray<SortInput<TSort>> | undefined;
  readonly filter?: Filter<TFilter, TRelationFields> | undefined;
  /** A search term; blank means no search. */
  readonly search?: string | undefined;
  readonly page?: PageInput | undefined;
}

/** The selection alias of the n-th sort key; invariant under Kysely's CamelCasePlugin. */
export function keyAlias(index: number): string {
  return `keyset${String(index)}`;
}

function searchPredicate(
  definition: KeysetDefinition,
  term: string | undefined,
): Predicate | null {
  const trimmed = term?.trim() ?? '';
  if (trimmed.length === 0) {
    return null;
  }
  const { search } = definition;
  if (search === null) {
    throw new UnsupportedSearchError();
  }
  if (search.mode === 'like') {
    return {
      kind: 'like',
      target: {
        kind: 'concat',
        table: definition.table,
        columns: search.columns,
      },
      pattern: `%${escapeLike(trimmed)}%`,
      caseInsensitive: true,
    };
  }
  return {
    kind: 'textSearch',
    table: definition.table,
    source: search.source,
    mode: search.mode,
    config: search.config,
    term: trimmed,
  };
}

/** `AND` of the non-null predicates; a single one as is; `null` for none. */
function conjunction(items: ReadonlyArray<Predicate | null>): Predicate | null {
  const present = items.filter((item) => item !== null);
  const [first] = present;
  if (first === undefined) {
    return null;
  }
  return present.length === 1 ? first : { kind: 'and', items: present };
}

function invert(direction: SortDirection): SortDirection {
  return direction === 'asc' ? 'desc' : 'asc';
}

async function decode(
  codec: CursorCodec,
  cursor: string | null,
  parameter: 'after' | 'before',
  context: string,
  length: number,
): Promise<ReadonlyArray<CursorValue> | null> {
  if (cursor === null) {
    return null;
  }
  const result = await codec.decode(cursor, context, length);
  if (!result.ok) {
    throw new InvalidCursorError(parameter, result.reason);
  }
  return result.values;
}

export function createPlanner(
  definition: KeysetDefinition,
  codec: CursorCodec,
): (request: KeysetRequest) => Promise<QueryPlan> {
  return async (request) => {
    const sort = resolveSort(definition, request.sort);
    const userFilter = normalizeFilter(definition, request.filter);
    const search = searchPredicate(definition, request.search);
    const filter = conjunction([userFilter, search]);
    const page = resolvePage(definition, request.page);
    const context = await sha256Base64Url(
      canonicalJson({
        sort: sortSignature(sort),
        filter: request.filter ?? null,
        search: request.search?.trim() ?? '',
      }),
    );
    const requested = sort.map((item) => {
      const field = definition.fields.get(item.field);
      if (field === undefined) {
        throw new TypeError(`sort field ${item.field} is not declared`);
      }
      return {
        field: item.field,
        target: targetOf(definition.table, field, definition.relations),
        direction: item.direction,
      };
    });
    const afterValues = await decode(
      codec,
      page.after,
      'after',
      context,
      sort.length,
    );
    const beforeValues = await decode(
      codec,
      page.before,
      'before',
      context,
      sort.length,
    );
    const seeks: Array<Predicate> = [];
    if (afterValues !== null) {
      seeks.push(seekPredicate(requested, afterValues, 'after'));
    }
    if (beforeValues !== null) {
      seeks.push(seekPredicate(requested, beforeValues, 'before'));
    }
    const reversed = beforeValues !== null && afterValues === null;
    const keys: Array<PlanKey> = requested.map((key, index) => ({
      alias: keyAlias(index),
      field: key.field,
      target: key.target,
      direction: reversed ? invert(key.direction) : key.direction,
      nulls: reversed ? 'first' : 'last',
    }));
    return {
      table: definition.table,
      keys,
      reversed,
      filter,
      seek: conjunction(seeks),
      limit: page.size + 1,
      size: page.size,
      range: page.range,
      after: page.after,
      before: page.before,
      sort,
      context,
    };
  };
}
