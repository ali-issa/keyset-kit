/**
 * Page assembly (SPEC 7.2): the fetched rows (one more than the page size)
 * become a `Page` with a cursor per row, the boundary cursors, and whether
 * further pages exist. On a backward page the rows arrive inverted and
 * are put back in request order first.
 * @ref https://jsonapi.org/profiles/ethanresnick/cursor-pagination/#auto-id--links (prev and next, null when no page)
 * @ref https://jsonapi.org/profiles/ethanresnick/cursor-pagination/#auto-id--query-parameters (range truncation)
 * @packageDocumentation
 */
import type { CursorCodec } from '../cursor/codec';
import type { CursorValue, QueryPlan } from '../plan/types';

export interface Page<TRow> {
  readonly rows: Array<TRow>;
  /** The cursor that falls on each row, parallel to `rows`. */
  readonly cursors: ReadonlyArray<string>;
  /** `page[after]` for the next page, `null` when there is none. */
  readonly next: string | null;
  /** `page[before]` for the previous page, `null` when there is none. */
  readonly prev: string | null;
  readonly hasNext: boolean;
  readonly hasPrev: boolean;
  /** The used page size. */
  readonly size: number;
  readonly total?: number | undefined;
  /** Set on a range request whose results exceeded the used page size. */
  readonly rangeTruncated?: boolean | undefined;
  /** The cursor of a row of this page. */
  cursor(row: TRow): string;
}

export interface FinishOptions {
  readonly total?: number | undefined;
}

/**
 * `values(row)` returns the row's sort-key values in `plan.keys` order,
 * each a string or `null`, as the adapter selected them.
 */
export async function finishPage<TRow>(
  plan: QueryPlan,
  codec: CursorCodec,
  fetched: ReadonlyArray<TRow>,
  values: (row: TRow) => ReadonlyArray<CursorValue>,
  options: FinishOptions = {},
): Promise<Page<TRow>> {
  const more = fetched.length > plan.size;
  const rows = fetched.slice(0, plan.size);
  if (plan.reversed) {
    rows.reverse();
  }
  const cursors = await Promise.all(
    rows.map(async (row) => {
      const keyValues = values(row);
      if (
        keyValues.length !== plan.keys.length ||
        !keyValues.every((v) => v === null || typeof v === 'string')
      ) {
        throw new TypeError(
          'sort key values must be one string or null per plan key',
        );
      }
      return codec.encode(keyValues, plan.context);
    }),
  );
  const byRow = new Map<TRow, string>(
    rows.map((row, index) => [row, cursors[index] ?? '']),
  );
  const first = cursors[0];
  const last = cursors.at(-1);
  let hasNext: boolean;
  let hasPrev: boolean;
  if (plan.range) {
    hasPrev = true;
    hasNext = true;
  } else if (plan.reversed) {
    hasNext = true;
    hasPrev = more;
  } else {
    hasPrev = plan.after !== null;
    hasNext = more;
  }
  // An empty page still has neighbours: the items before `after` are the
  // previous page and the items after `before` are the next one.
  const next = hasNext ? (last ?? plan.before) : null;
  const prev = hasPrev ? (first ?? plan.after) : null;
  return {
    rows,
    cursors,
    next,
    prev,
    hasNext,
    hasPrev,
    size: plan.size,
    total: options.total,
    rangeTruncated: plan.range && more ? true : undefined,
    cursor(row) {
      const cursor = byRow.get(row);
      if (cursor === undefined) {
        throw new TypeError('row is not part of this page');
      }
      return cursor;
    },
  };
}
