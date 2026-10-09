import type { ColumnTarget, Predicate } from './types';

import { describe, expect, it } from 'vitest';

import { seekPredicate } from './seek';

const created: ColumnTarget = {
  kind: 'column',
  table: 'contacts',
  column: 'created_at',
  type: 'timestamptz',
  lower: false,
};
const id: ColumnTarget = {
  kind: 'column',
  table: 'contacts',
  column: 'id',
  type: 'uuid',
  lower: false,
};

const createdAsc = { target: created, direction: 'asc' } as const;
const createdDesc = { target: created, direction: 'desc' } as const;
const idAsc = { target: id, direction: 'asc' } as const;

function compare(
  target: ColumnTarget,
  operator: '=' | '>' | '<',
  value: string,
): Predicate {
  return { kind: 'compare', target, operator, value };
}

function isNull(target: ColumnTarget, negate = false): Predicate {
  return { kind: 'null', target, negate };
}

describe('seekPredicate', () => {
  it('after a value, ascending: greater values and the nulls that sort last', () => {
    expect(seekPredicate([createdAsc], ['2024'], 'after')).toEqual({
      kind: 'or',
      items: [compare(created, '>', '2024'), isNull(created)],
    });
  });

  it('after a value, descending: smaller values and the nulls', () => {
    expect(seekPredicate([createdDesc], ['2024'], 'after')).toEqual({
      kind: 'or',
      items: [compare(created, '<', '2024'), isNull(created)],
    });
  });

  it('before a value: the opposite comparison, never a null', () => {
    expect(seekPredicate([createdAsc], ['2024'], 'before')).toEqual(
      compare(created, '<', '2024'),
    );
    expect(seekPredicate([createdDesc], ['2024'], 'before')).toEqual(
      compare(created, '>', '2024'),
    );
  });

  it('after a null there is nothing on that key; before a null, every value', () => {
    expect(seekPredicate([createdAsc], [null], 'after')).toEqual({
      kind: 'literal',
      value: false,
    });
    expect(seekPredicate([createdAsc], [null], 'before')).toEqual(
      isNull(created, true),
    );
  });

  it('breaks ties on the next key with prefix equality', () => {
    expect(seekPredicate([createdDesc, idAsc], ['2024', 'k'], 'after')).toEqual(
      {
        kind: 'or',
        items: [
          {
            kind: 'or',
            items: [compare(created, '<', '2024'), isNull(created)],
          },
          {
            kind: 'and',
            items: [
              compare(created, '=', '2024'),
              { kind: 'or', items: [compare(id, '>', 'k'), isNull(id)] },
            ],
          },
        ],
      },
    );
  });

  it('matches a null prefix with IS NULL so rows inside the null run can continue', () => {
    expect(seekPredicate([createdAsc, idAsc], [null, 'k'], 'after')).toEqual({
      kind: 'or',
      items: [
        { kind: 'literal', value: false },
        {
          kind: 'and',
          items: [
            isNull(created),
            { kind: 'or', items: [compare(id, '>', 'k'), isNull(id)] },
          ],
        },
      ],
    });
    expect(seekPredicate([createdAsc, idAsc], [null, 'k'], 'before')).toEqual({
      kind: 'or',
      items: [
        isNull(created, true),
        { kind: 'and', items: [isNull(created), compare(id, '<', 'k')] },
      ],
    });
  });
});
