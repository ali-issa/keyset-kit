import type { QueryPlan } from '../plan/types';

import { describe, expect, it } from 'vitest';

import { createCursorCodec } from '../cursor/codec';
import { createPlanner } from '../plan/plan';
import { definition, rejected, SECRET } from '../test-support/fixtures';
import { finishPage } from './finish';

interface Row {
  readonly id: string;
  readonly keyset0: string | null;
}

const codec = createCursorCodec({ secret: SECRET });
const plan = createPlanner(definition, codec);

function rows(...ids: ReadonlyArray<string>): Array<Row> {
  return ids.map((id) => ({ id, keyset0: id }));
}

function values(row: Row): ReadonlyArray<string | null> {
  return [row.keyset0];
}

async function decodeAll(
  page: { cursors: ReadonlyArray<string> },
  context: string,
) {
  return Promise.all(
    page.cursors.map(async (cursor) => codec.decode(cursor, context, 1)),
  );
}

describe('finishPage', () => {
  it('builds a first page: the extra row proves a next page, there is no previous', async () => {
    const first = await plan({ page: { size: 2 } });
    const page = await finishPage(first, codec, rows('a', 'b', 'c'), values);
    expect(page.rows).toEqual(rows('a', 'b'));
    expect(page.size).toBe(2);
    expect(page.hasNext).toBe(true);
    expect(page.hasPrev).toBe(false);
    expect(page.prev).toBeNull();
    expect(page.next).toBe(page.cursors[1]);
    expect(page.total).toBeUndefined();
    expect(page.rangeTruncated).toBeUndefined();
    expect(await decodeAll(page, first.context)).toEqual([
      { ok: true, values: ['a'] },
      { ok: true, values: ['b'] },
    ]);
  });

  it('gives every row its own cursor, by identity', async () => {
    const first = await plan({ page: { size: 2 } });
    const fetched = rows('a', 'b');
    const page = await finishPage(first, codec, fetched, values);
    expect(page.cursor(fetched[0] as Row)).toBe(page.cursors[0]);
    expect(page.cursor(fetched[1] as Row)).toBe(page.cursors[1]);
    expect(() => page.cursor({ id: 'a', keyset0: 'a' })).toThrow(
      'row is not part of this page',
    );
  });

  it('builds a last page after a cursor: previous exists, next does not', async () => {
    const first = await plan({ page: { size: 2 } });
    const after = await codec.encode(['b'], first.context);
    const last = await plan({ page: { size: 2, after } });
    const page = await finishPage(last, codec, rows('c'), values);
    expect(page.rows).toEqual(rows('c'));
    expect(page.hasPrev).toBe(true);
    expect(page.prev).toBe(page.cursors[0]);
    expect(page.hasNext).toBe(false);
    expect(page.next).toBeNull();
  });

  it('puts a backward page back into request order', async () => {
    const first = await plan({ page: { size: 2 } });
    const before = await codec.encode(['e'], first.context);
    const previous = await plan({ page: { size: 2, before } });
    expect(previous.reversed).toBe(true);
    // The query ran inverted: d, c, then the extra row b.
    const page = await finishPage(previous, codec, rows('d', 'c', 'b'), values);
    expect(page.rows).toEqual(rows('c', 'd'));
    expect(page.hasNext).toBe(true);
    expect(page.hasPrev).toBe(true);
    expect(page.next).toBe(page.cursors[1]);
    expect(page.prev).toBe(page.cursors[0]);
    expect(await decodeAll(page, previous.context)).toEqual([
      { ok: true, values: ['c'] },
      { ok: true, values: ['d'] },
    ]);
    const start = await finishPage(previous, codec, rows('b', 'a'), values);
    expect(start.rows).toEqual(rows('a', 'b'));
    expect(start.hasPrev).toBe(false);
    expect(start.prev).toBeNull();
  });

  it('points an empty page back at the cursors the request came from', async () => {
    const first = await plan({ page: { size: 2 } });
    const after = await codec.encode(['z'], first.context);
    const forward = await finishPage(
      await plan({ page: { size: 2, after } }),
      codec,
      [],
      values,
    );
    expect(forward.rows).toEqual([]);
    expect(forward.hasPrev).toBe(true);
    expect(forward.prev).toBe(after);
    expect(forward.hasNext).toBe(false);
    expect(forward.next).toBeNull();
    const before = await codec.encode(['a'], first.context);
    const backward = await finishPage(
      await plan({ page: { size: 2, before } }),
      codec,
      [],
      values,
    );
    expect(backward.hasNext).toBe(true);
    expect(backward.next).toBe(before);
    expect(backward.hasPrev).toBe(false);
    expect(backward.prev).toBeNull();
  });

  it('marks a truncated range and always links both ways on one', async () => {
    const first = await plan({});
    const after = await codec.encode(['a'], first.context);
    const before = await codec.encode(['z'], first.context);
    const range = await plan({ page: { after, before, size: 2 } });
    const truncated = await finishPage(
      range,
      codec,
      rows('b', 'c', 'd'),
      values,
    );
    expect(truncated.rows).toEqual(rows('b', 'c'));
    expect(truncated.rangeTruncated).toBe(true);
    expect(truncated.hasNext).toBe(true);
    expect(truncated.hasPrev).toBe(true);
    expect(truncated.next).toBe(truncated.cursors[1]);
    expect(truncated.prev).toBe(truncated.cursors[0]);
    const whole = await finishPage(range, codec, rows('b', 'c'), values);
    expect(whole.rangeTruncated).toBeUndefined();
    expect(whole.hasNext).toBe(true);
    const empty = await finishPage(range, codec, [], values);
    expect(empty.next).toBe(before);
    expect(empty.prev).toBe(after);
  });

  it('passes the total through and encodes null key values', async () => {
    const first = await plan({ page: { size: 1 } });
    const page = await finishPage(
      first,
      codec,
      [{ id: 'n', keyset0: null }],
      values,
      {
        total: 42,
      },
    );
    expect(page.total).toBe(42);
    expect(await decodeAll(page, first.context)).toEqual([
      { ok: true, values: [null] },
    ]);
  });

  it('rejects key values of the wrong shape', async () => {
    const first = await plan({ page: { size: 1 } });
    expect(
      await rejected(finishPage(first, codec, rows('a'), () => ['a', 'b'])),
    ).toEqual(
      new TypeError('sort key values must be one string or null per plan key'),
    );
    expect(
      await rejected(finishPage(first, codec, rows('a'), () => [1 as never])),
    ).toBeInstanceOf(TypeError);
  });

  it('accepts a plan built by hand', async () => {
    const first = await plan({ page: { size: 1 } });
    const handmade: QueryPlan = { ...first, size: 3, limit: 4 };
    const page = await finishPage(handmade, codec, rows('a', 'b'), values);
    expect(page.rows).toHaveLength(2);
    expect(page.hasNext).toBe(false);
  });
});
