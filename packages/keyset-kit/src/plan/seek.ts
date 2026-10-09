/**
 * The seek predicate (SPEC 6.2): "rows after the cursor" or "rows before
 * the cursor" in a total order over several keys with `NULLS LAST`, as
 * a disjunction of prefix-equality conjunctions. Nulls sort after every
 * value in both directions, so after a null there is nothing on that key,
 * before a null there is every non-null value, and after a value there is
 * every greater (or smaller, descending) value and every null.
 * @ref https://www.postgresql.org/docs/current/queries-order.html (NULLS LAST, later keys break ties)
 * @ref https://use-the-index-luke.com/sql/partial-results/fetch-next-page (seek method)
 * @packageDocumentation
 */
import type { SortDirection } from '../definition/types';
import type { CursorValue, PlanKey, Predicate } from './types';

type Side = 'after' | 'before';
type SeekKey = Pick<PlanKey, 'target' | 'direction'>;

function equal(key: SeekKey, value: CursorValue): Predicate {
  return value === null
    ? { kind: 'null', target: key.target, negate: false }
    : { kind: 'compare', target: key.target, operator: '=', value };
}

function beyond(key: SeekKey, value: CursorValue, side: Side): Predicate {
  const forward = (key.direction satisfies SortDirection) === 'asc';
  if (side === 'after') {
    if (value === null) {
      return { kind: 'literal', value: false };
    }
    return {
      kind: 'or',
      items: [
        {
          kind: 'compare',
          target: key.target,
          operator: forward ? '>' : '<',
          value,
        },
        { kind: 'null', target: key.target, negate: false },
      ],
    };
  }
  if (value === null) {
    return { kind: 'null', target: key.target, negate: true };
  }
  return {
    kind: 'compare',
    target: key.target,
    operator: forward ? '<' : '>',
    value,
  };
}

/**
 * `keys` carry the request's directions (not the inverted ones of a
 * backward page); `values` is the cursor's value per key.
 */
export function seekPredicate(
  keys: ReadonlyArray<SeekKey>,
  values: ReadonlyArray<CursorValue>,
  side: Side,
): Predicate {
  const alternatives: Array<Predicate> = keys.map((key, index) => {
    const prefix = keys
      .slice(0, index)
      .map((k, j) => equal(k, values[j] ?? null));
    const last = beyond(key, values[index] ?? null, side);
    return prefix.length === 0
      ? last
      : { kind: 'and', items: [...prefix, last] };
  });
  return alternatives.length === 1
    ? (alternatives[0] ?? { kind: 'literal', value: false })
    : { kind: 'or', items: alternatives };
}
