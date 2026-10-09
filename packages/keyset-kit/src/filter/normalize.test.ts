import type { Predicate } from '../plan/types';

import { describe, expect, it } from 'vitest';

import { age, column, invalidPath, unsupported } from '../test-support/filter';
import { definition } from '../test-support/fixtures';
import { normalizeFilter } from './normalize';

describe('normalizeFilter', () => {
  it('is null without a filter', () => {
    expect(normalizeFilter(definition)).toBeNull();
  });

  it('combines and, or, and not at any depth', () => {
    const a: Predicate = {
      kind: 'compare',
      target: age,
      operator: '>',
      value: 1,
    };
    const b: Predicate = { kind: 'null', target: age, negate: false };
    expect(
      normalizeFilter(definition, {
        or: [
          {
            and: [
              { field: 'age', op: 'gt', value: 1 },
              { not: { field: 'age', op: 'isNull' } },
            ],
          },
          { field: 'age', op: 'isNull' },
        ],
      }),
    ).toEqual({
      kind: 'or',
      items: [{ kind: 'and', items: [a, { kind: 'not', item: b }] }, b],
    });
    expect(normalizeFilter(definition, { and: [] })).toEqual({
      kind: 'and',
      items: [],
    });
  });

  it('reports the path of a malformed node', () => {
    expect(
      invalidPath(() => normalizeFilter(definition, 'x' as never)),
    ).toEqual([]);
    expect(invalidPath(() => normalizeFilter(definition, {} as never))).toEqual(
      [],
    );
    expect(
      invalidPath(() => normalizeFilter(definition, { and: 'x' } as never)),
    ).toEqual([]);
    expect(
      invalidPath(() =>
        normalizeFilter(definition, { and: [{ or: [1] }] } as never),
      ),
    ).toEqual(['and', 0, 'or', 0]);
    expect(
      invalidPath(() =>
        normalizeFilter(definition, { not: { field: 'age' } } as never),
      ),
    ).toEqual(['not']);
    expect(
      invalidPath(() =>
        normalizeFilter(definition, {
          field: 'age',
          op: 'eq',
          value: 1,
          extra: 1,
        } as never),
      ),
    ).toEqual([]);
    expect(
      invalidPath(() => normalizeFilter(definition, { and: [], or: [] })),
    ).toEqual([]);
    expect(
      invalidPath(() =>
        normalizeFilter(definition, { field: 'age', op: 1 } as never),
      ),
    ).toEqual([]);
  });

  it('filters on a relation field through exists over the relation', () => {
    expect(
      normalizeFilter(definition, {
        field: 'emails.email',
        op: 'endsWith',
        value: '@x.io',
      }),
    ).toEqual({
      kind: 'exists',
      relation: definition.relations.get('emails'),
      predicate: {
        kind: 'like',
        target: column('email', 'text', 'contact_emails'),
        pattern: '%@x.io',
        caseInsensitive: false,
      },
    });
    expect(
      unsupported(() =>
        normalizeFilter(definition, {
          field: 'phones.number',
          op: 'eq',
          value: 1,
        } as never),
      ),
    ).toEqual({ field: 'phones.number', operator: null });
    expect(
      unsupported(() =>
        normalizeFilter(definition, {
          field: 'emails.nope',
          op: 'eq',
          value: 1,
        } as never),
      ),
    ).toEqual({ field: 'emails.nope', operator: null });
  });

  it('scopes a relation node to the relation and allows nesting inside it', () => {
    expect(
      normalizeFilter(definition, {
        relation: 'emails',
        some: {
          and: [
            { field: 'primary', op: 'eq', value: true },
            { field: 'email', op: 'containsi', value: 'ada' },
          ],
        },
      }),
    ).toEqual({
      kind: 'exists',
      relation: definition.relations.get('emails'),
      predicate: {
        kind: 'and',
        items: [
          {
            kind: 'compare',
            target: column('is_primary', 'boolean', 'contact_emails'),
            operator: '=',
            value: true,
          },
          {
            kind: 'like',
            target: column('email', 'text', 'contact_emails'),
            pattern: '%ada%',
            caseInsensitive: true,
          },
        ],
      },
    });
    expect(
      unsupported(() =>
        normalizeFilter(definition, {
          relation: 'phones',
          some: { field: 'x', op: 'eq' },
        } as never),
      ),
    ).toEqual({ field: 'phones', operator: null });
    expect(
      unsupported(() =>
        normalizeFilter(definition, {
          relation: 1,
          some: { field: 'x', op: 'eq' },
        } as never),
      ),
    ).toEqual({ field: '1', operator: null });
    expect(
      unsupported(() =>
        normalizeFilter(definition, {
          relation: 'emails',
          some: { field: 'firstName', op: 'eq', value: 'x' },
        } as never),
      ),
    ).toEqual({ field: 'firstName', operator: null });
    expect(
      unsupported(() =>
        normalizeFilter(definition, {
          relation: 'emails',
          some: {
            relation: 'emails',
            some: { field: 'email', op: 'eq', value: 'x' },
          },
        } as never),
      ),
    ).toEqual({ field: 'emails', operator: null });
  });
});
