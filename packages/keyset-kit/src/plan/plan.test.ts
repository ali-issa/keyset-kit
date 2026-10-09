import { describe, expect, it } from 'vitest';

import { createCursorCodec } from '../cursor/codec';
import { defineKeyset } from '../definition/define-keyset';
import {
  InvalidPageSizeError,
  UnsupportedSearchError,
  UnsupportedSortError,
} from '../errors';
import {
  CONTACTS,
  contacts,
  definition,
  rejected,
  SECRET,
} from '../test-support/fixtures';
import { createPlanner, keyAlias } from './plan';

const codec = createCursorCodec({ secret: SECRET });
const plan = createPlanner(definition, codec);

describe('createPlanner', () => {
  it('plans the default request: default sort, key appended, size + 1 rows', async () => {
    const result = await plan({});
    expect(result).toMatchObject({
      table: 'contacts',
      reversed: false,
      filter: null,
      seek: null,
      limit: 21,
      size: 20,
      range: false,
      after: null,
      before: null,
      sort: [{ field: 'id', direction: 'asc' }],
    });
    expect(result.keys).toEqual([
      {
        alias: 'keyset0',
        field: 'id',
        target: {
          kind: 'column',
          table: 'contacts',
          column: 'id',
          type: 'uuid',
          lower: false,
        },
        direction: 'asc',
        nulls: 'last',
      },
    ]);
    expect(result.context).toMatch(/^[A-Za-z0-9_-]{43}$/u);
  });

  it('names selection aliases keysetN', () => {
    expect(keyAlias(0)).toBe('keyset0');
    expect(keyAlias(12)).toBe('keyset12');
  });

  it('orders by the requested sort with nulls last and the key as tie-breaker', async () => {
    const result = await plan({ sort: ['-lastName', 'age'] });
    expect(
      result.keys.map(({ alias, field, direction, nulls }) => [
        alias,
        field,
        direction,
        nulls,
      ]),
    ).toEqual([
      ['keyset0', 'lastName', 'desc', 'last'],
      ['keyset1', 'age', 'asc', 'last'],
      ['keyset2', 'id', 'asc', 'last'],
    ]);
    expect(result.keys[0]?.target).toMatchObject({
      column: 'last_name',
      lower: true,
    });
    expect(result.keys[2]?.target).toMatchObject({ column: 'id' });
  });

  it('binds the context to the sort, the filter, and the search, not their spelling', async () => {
    const base = await plan({});
    const sorted = await plan({ sort: ['-createdAt'] });
    const filtered = await plan({
      filter: { field: 'age', op: 'gt', value: 1 },
    });
    const reordered = await plan({
      filter: { value: 1, op: 'gt', field: 'age' },
    });
    const searched = await plan({ search: '  ada ' });
    const searchedAgain = await plan({ search: 'ada' });
    expect(
      new Set([
        base.context,
        sorted.context,
        filtered.context,
        searched.context,
      ]).size,
    ).toBe(4);
    expect(reordered.context).toBe(filtered.context);
    expect(searchedAgain.context).toBe(searched.context);
    expect((await plan({ search: '   ' })).context).toBe(base.context);
  });

  it('turns a like search into ILIKE over the concatenated columns', async () => {
    const result = await plan({ search: ' 50% ' });
    expect(result.filter).toEqual({
      kind: 'like',
      target: {
        kind: 'concat',
        table: 'contacts',
        columns: ['first_name', 'last_name'],
      },
      pattern: '%50\\%%',
      caseInsensitive: true,
    });
  });

  it('turns a text search into a textSearch node and joins it with the filter', async () => {
    const vector = createPlanner(
      defineKeyset({
        ...CONTACTS,
        search: { vector: 'search_vector', config: 'english' },
      }).definition,
      codec,
    );
    const result = await vector({
      search: 'ada lovelace',
      filter: { field: 'active', op: 'eq', value: true },
    });
    expect(result.filter).toEqual({
      kind: 'and',
      items: [
        {
          kind: 'compare',
          target: {
            kind: 'column',
            table: 'contacts',
            column: 'active',
            type: 'boolean',
            lower: false,
          },
          operator: '=',
          value: true,
        },
        {
          kind: 'textSearch',
          table: 'contacts',
          source: { vector: 'search_vector' },
          mode: 'websearch',
          config: 'english',
          term: 'ada lovelace',
        },
      ],
    });
  });

  it('rejects a search when the definition has none', async () => {
    const plain = createPlanner(
      defineKeyset({ ...CONTACTS, search: undefined }).definition,
      codec,
    );
    expect(await rejected(plain({ search: 'x' }))).toBeInstanceOf(
      UnsupportedSearchError,
    );
    expect((await plain({ search: '' })).filter).toBeNull();
  });

  it('validates the sort before the page', async () => {
    expect(
      await rejected(plan({ sort: ['nope'], page: { size: 0 } })),
    ).toBeInstanceOf(UnsupportedSortError);
    expect(await rejected(plan({ page: { size: 0 } }))).toBeInstanceOf(
      InvalidPageSizeError,
    );
  });

  it('is what the keyset exposes as plan', async () => {
    const viaKeyset = await contacts.plan({ sort: ['-age'] });
    const direct = await plan({ sort: ['-age'] });
    expect(viaKeyset.context).toBe(direct.context);
  });
});
