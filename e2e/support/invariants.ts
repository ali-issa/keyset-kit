/**
 * The invariants every harness must satisfy (SPEC 11): walking forward
 * visits every row once in the expected order, walking backward visits
 * the same rows in the same order, an item's cursor resumes right after
 * it, and `next` then `prev` returns to the page it came from. Run over
 * several sorts, including ones with equal values and nulls, and several
 * page sizes.
 */
import type { Page } from 'kysely-keyset';

import type { Harness } from './db.ts';
import type { SortableField } from './schema.ts';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { contacts } from './keysets.ts';
import { expectedIds } from './schema.ts';

type SortName = SortableField | `-${SortableField}`;
type Sort = ReadonlyArray<SortName>;
type Row = { id: string };

const SORTS: ReadonlyArray<Sort> = [
  ['id'],
  ['-createdAt'],
  ['age', '-id'],
  ['-lastName'],
  ['score', 'createdAt'],
  ['-emailCount', 'lastName'],
  ['latestStart'],
  ['-birthday', '-age'],
];

const SIZES: ReadonlyArray<number> = [1, 3, 5];

function ids(page: Page<Row>): Array<string> {
  return page.rows.map((row) => row.id);
}

export function runInvariants(
  label: string,
  open: () => Promise<Harness>,
): void {
  describe(`${label}: invariants`, () => {
    let harness: Harness;
    beforeAll(async () => {
      harness = await open();
    });
    afterAll(async () => {
      await harness.close();
    });

    const query = () =>
      harness.db.selectFrom('contacts').select(['id', 'first_name']);

    async function fetch(
      sort: Sort,
      page: { size: number; after?: string; before?: string },
    ): Promise<Page<Row>> {
      return contacts.paginate(query(), { sort, page });
    }

    describe.each(SORTS.map((sort) => [sort.join(','), sort] as const))(
      'sort %s',
      (_label, sort) => {
        const expected = expectedIds(sort);

        it.each(SIZES)(
          'walks forward through every row once with size %i',
          async (size) => {
            const seen: Array<string> = [];
            let page = await fetch(sort, { size });
            expect(page.hasPrev).toBe(false);
            expect(page.prev).toBeNull();
            for (;;) {
              seen.push(...ids(page));
              expect(page.rows.length).toBeLessThanOrEqual(size);
              if (page.next === null) {
                expect(page.hasNext).toBe(false);
                break;
              }
              expect(page.hasNext).toBe(true);
              page = await fetch(sort, { size, after: page.next });
              expect(page.hasPrev).toBe(true);
            }
            expect(seen).toEqual(expected);
          },
        );

        it.each(SIZES)(
          'walks backward from the end in the same order with size %i',
          async (size) => {
            let last = await fetch(sort, { size });
            while (last.next !== null) {
              last = await fetch(sort, { size, after: last.next });
            }
            const seen: Array<string> = ids(last);
            let page = last;
            while (page.prev !== null) {
              page = await fetch(sort, { size, before: page.prev });
              expect(page.hasNext).toBe(true);
              seen.unshift(...ids(page));
            }
            expect(page.hasPrev).toBe(false);
            expect(seen).toEqual(expected);
          },
        );

        it('resumes right after any item from its own cursor', async () => {
          const all = await fetch(sort, { size: 50 });
          expect(ids(all)).toEqual(expected);
          for (const [index, row] of all.rows.entries()) {
            const after = await fetch(sort, {
              size: 3,
              after: all.cursor(row),
            });
            expect(ids(after)).toEqual(expected.slice(index + 1, index + 4));
            const before = await fetch(sort, {
              size: 3,
              before: all.cursor(row),
            });
            expect(ids(before)).toEqual(
              expected.slice(Math.max(0, index - 3), index),
            );
          }
        });

        it('returns to the first page from the second through prev', async () => {
          const first = await fetch(sort, { size: 4 });
          const second = await fetch(sort, {
            size: 4,
            after: first.next ?? '',
          });
          expect(ids(second)).toEqual(expected.slice(4, 8));
          const back = await fetch(sort, {
            size: 4,
            before: second.prev ?? '',
          });
          expect(ids(back)).toEqual(ids(first));
          expect(back.hasPrev).toBe(false);
          expect(back.hasNext).toBe(true);
          expect(back.next).toBe(first.next);
        });
      },
    );
  });
}
