import { describe, expect, it } from 'vitest';

import { CONTACTS, SECRET, thrown } from '../test-support/fixtures';
import {
  DEFAULT_MAX_PAGE_SIZE,
  DEFAULT_PAGE_SIZE,
  defineKeyset,
} from './define-keyset';

function message(fn: () => unknown): string {
  const error = thrown(fn);
  expect(error).toBeInstanceOf(TypeError);
  return (error as TypeError).message;
}

const MINIMAL = {
  table: 'items',
  key: ['id'],
  fields: {
    id: { column: 'id', type: 'integer' },
    name: { column: 'name', type: 'text', nullable: true },
  },
  cursor: { secret: SECRET },
} as const;

describe('defineKeyset', () => {
  it('normalizes the definition with the documented defaults', () => {
    const { definition } = defineKeyset(MINIMAL);
    expect(definition.table).toBe('items');
    expect(definition.key).toEqual(['id']);
    expect([...definition.fields.keys()]).toEqual(['id', 'name']);
    expect(definition.relations.size).toBe(0);
    expect(definition.search).toBeNull();
    expect(definition.sort.default).toEqual([
      { field: 'id', direction: 'asc' },
    ]);
    expect(definition.page).toEqual({
      default: DEFAULT_PAGE_SIZE,
      max: DEFAULT_MAX_PAGE_SIZE,
      range: false,
    });
    expect(definition.cursor.ttl).toBeNull();
  });

  it('keeps relations, search, page, and cursor options', () => {
    const { definition } = defineKeyset({
      ...CONTACTS,
      page: { default: 10, max: 50, range: true },
      cursor: { secret: SECRET, ttl: 3600 },
    });
    expect([...definition.relations.keys()]).toEqual(['emails', 'workHistory']);
    expect(definition.search).toEqual({
      mode: 'like',
      columns: ['first_name', 'last_name'],
    });
    expect(definition.page).toEqual({ default: 10, max: 50, range: true });
    expect(definition.cursor.ttl).toBe(3600);
  });

  it('plans and pages through the returned object', async () => {
    const keyset = defineKeyset(MINIMAL);
    const plan = await keyset.plan({});
    expect(plan.keys.map((key) => key.field)).toEqual(['id']);
    expect(plan.limit).toBe(DEFAULT_PAGE_SIZE + 1);
    const page = await keyset.page(plan, [{ id: 1 }], (row) => [
      String(row.id),
    ]);
    expect(page.rows).toEqual([{ id: 1 }]);
    expect(page.next).toBeNull();
  });

  describe('page', () => {
    it('lowers the default size to a smaller max', () => {
      expect(
        defineKeyset({ ...MINIMAL, page: { max: 5 } }).definition.page,
      ).toEqual({ default: 5, max: 5, range: false });
    });

    it('rejects a default above the max and non-positive sizes', () => {
      expect(
        message(() =>
          defineKeyset({ ...MINIMAL, page: { default: 30, max: 20 } }),
        ),
      ).toBe('page.default must not exceed page.max');
      expect(
        message(() => defineKeyset({ ...MINIMAL, page: { max: 0 } })),
      ).toBe('page.max must be a positive integer');
      expect(
        message(() => defineKeyset({ ...MINIMAL, page: { default: 1.5 } })),
      ).toBe('page.default must be a positive integer');
      expect(
        message(() =>
          defineKeyset({ ...MINIMAL, page: { range: 'yes' as never } }),
        ),
      ).toBe('page.range must be a boolean');
      expect(
        message(() => defineKeyset({ ...MINIMAL, page: 5 as never })),
      ).toBe('page must be an object');
    });
  });

  describe('key', () => {
    it('must name declared, sortable, non-nullable column fields', () => {
      expect(message(() => defineKeyset({ ...MINIMAL, key: [] }))).toBe(
        'key must be a non-empty array of names',
      );
      expect(
        message(() => defineKeyset({ ...MINIMAL, key: ['id', 'id'] })),
      ).toBe('key must not repeat a field');
      expect(
        message(() => defineKeyset({ ...MINIMAL, key: ['name'] })),
      ).toContain(
        'key must name declared, sortable, non-nullable column fields: "name"',
      );
      expect(
        message(() => defineKeyset({ ...MINIMAL, key: ['nope'] as never })),
      ).toContain('"nope"');
      expect(
        message(() =>
          defineKeyset({
            ...MINIMAL,
            key: ['id'],
            fields: { id: { column: 'id', type: 'integer', sortable: false } },
          }),
        ),
      ).toContain('"id"');
      expect(
        message(() =>
          defineKeyset({ ...CONTACTS, key: ['emailCount'] as never }),
        ),
      ).toContain('"emailCount"');
      expect(
        message(() => defineKeyset({ ...CONTACTS, key: ['tags'] as never })),
      ).toContain('"tags"');
    });
  });

  describe('sort', () => {
    it('resolves the default sort and appends the key', () => {
      const { definition } = defineKeyset({
        ...MINIMAL,
        sort: { default: ['-name'] },
      });
      expect(definition.sort.default).toEqual([
        { field: 'name', direction: 'desc' },
        { field: 'id', direction: 'asc' },
      ]);
    });

    it('rejects unsortable or unknown default sort fields at definition time', () => {
      expect(
        message(() =>
          defineKeyset({ ...MINIMAL, sort: { default: ['nope' as never] } }),
        ),
      ).toBe('sort.default names fields that are not sortable: nope');
      expect(
        message(() =>
          defineKeyset({ ...MINIMAL, sort: { default: 'name' as never } }),
        ),
      ).toBe('sort.default must be an array');
      expect(
        message(() => defineKeyset({ ...MINIMAL, sort: [] as never })),
      ).toBe('sort must be an object');
    });
  });

  describe('search', () => {
    it('defaults text search to websearch over the simple configuration', () => {
      expect(
        defineKeyset({ ...MINIMAL, search: { columns: ['name'] } }).definition
          .search,
      ).toEqual({
        mode: 'websearch',
        source: { columns: ['name'] },
        config: 'simple',
      });
      expect(
        defineKeyset({
          ...MINIMAL,
          search: {
            vector: 'search_vector',
            mode: 'phrase',
            config: 'english',
          },
        }).definition.search,
      ).toEqual({
        mode: 'phrase',
        source: { vector: 'search_vector' },
        config: 'english',
      });
    });

    it('validates the mode, the configuration name, and the source', () => {
      expect(
        message(() =>
          defineKeyset({
            ...MINIMAL,
            search: { mode: 'fuzzy' as never, columns: ['name'] },
          }),
        ),
      ).toBe('search.mode must be websearch, plain, phrase, or like');
      expect(
        message(() =>
          defineKeyset({
            ...MINIMAL,
            search: { columns: ['name'], config: "en'glish" },
          }),
        ),
      ).toContain('search.config must match');
      expect(
        message(() => defineKeyset({ ...MINIMAL, search: { columns: [] } })),
      ).toBe('search.columns must be a non-empty array of names');
      expect(
        message(() =>
          defineKeyset({ ...MINIMAL, search: { mode: 'like' } as never }),
        ),
      ).toBe('search.columns must be a non-empty array of names');
      expect(
        message(() =>
          defineKeyset({
            ...MINIMAL,
            search: { columns: ['name'], vector: 'v' } as never,
          }),
        ),
      ).toBe('search takes either columns or vector, not both');
      expect(
        message(() => defineKeyset({ ...MINIMAL, search: 'name' as never })),
      ).toBe('search must be an object');
    });
  });

  describe('cursor', () => {
    it('requires a cursor configuration with a long enough secret', () => {
      expect(
        message(() => defineKeyset({ ...MINIMAL, cursor: undefined as never })),
      ).toBe('cursor must be an object');
      expect(
        message(() =>
          defineKeyset({ ...MINIMAL, cursor: { secret: 'short' } }),
        ),
      ).toBe('cursor.secret must be at least 32 bytes');
    });
  });

  it('rejects a non-object and a bad table name', () => {
    expect(message(() => defineKeyset(null as never))).toBe(
      'defineKeyset requires an object',
    );
    expect(message(() => defineKeyset({ ...MINIMAL, table: '' }))).toBe(
      'table must be a non-empty string',
    );
  });
});
