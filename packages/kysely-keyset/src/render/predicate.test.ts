import type { Kysely } from 'kysely';

import type { ColumnTarget, Predicate } from 'keyset-kit';

import type { AnyDatabase } from '../types';

import { describe, expect, it } from 'vitest';

import { compileOnly } from '../test-support/db';
import { contacts } from '../test-support/keysets';
import { renderPredicate } from './predicate';

const db = compileOnly() as unknown as Kysely<AnyDatabase>;
const context = { table: 'contacts' };

function column(
  name: string,
  type: ColumnTarget['type'] = 'text',
): ColumnTarget {
  return {
    kind: 'column',
    table: 'contacts',
    column: name,
    type,
    lower: false,
  };
}

const age = column('age', 'integer');
const firstName = column('first_name');

function compile(node: Predicate): {
  where: string;
  parameters: ReadonlyArray<unknown>;
} {
  const compiled = db
    .selectFrom('contacts')
    .selectAll()
    .where((eb) => renderPredicate(eb, node, context))
    .compile();
  return {
    where: compiled.sql.slice(
      compiled.sql.indexOf(' where ') + ' where '.length,
    ),
    parameters: compiled.parameters,
  };
}

describe('renderPredicate', () => {
  it('binds comparison values as parameters', () => {
    expect(
      compile({ kind: 'compare', target: age, operator: '>=', value: 18 }),
    ).toEqual({
      where: '"contacts"."age" >= $1',
      parameters: [18],
    });
    expect(
      compile({ kind: 'compare', target: age, operator: '!=', value: '18' }),
    ).toEqual({
      where: '"contacts"."age" != $1',
      parameters: ['18'],
    });
  });

  it('renders null tests without parameters', () => {
    expect(compile({ kind: 'null', target: age, negate: false })).toEqual({
      where: '"contacts"."age" is null',
      parameters: [],
    });
    expect(compile({ kind: 'null', target: age, negate: true }).where).toBe(
      '"contacts"."age" is not null',
    );
  });

  it('renders membership as a parameter list', () => {
    expect(
      compile({ kind: 'in', target: age, values: [1, 2], negate: false }),
    ).toEqual({
      where: '"contacts"."age" in ($1, $2)',
      parameters: [1, 2],
    });
    expect(
      compile({ kind: 'in', target: age, values: [1], negate: true }).where,
    ).toBe('"contacts"."age" not in ($1)');
  });

  it('renders between, like, and ilike', () => {
    expect(compile({ kind: 'between', target: age, low: 1, high: 9 })).toEqual({
      where: '"contacts"."age" between $1 and $2',
      parameters: [1, 9],
    });
    expect(
      compile({
        kind: 'like',
        target: firstName,
        pattern: 'A%',
        caseInsensitive: false,
      }),
    ).toEqual({ where: '"contacts"."first_name" like $1', parameters: ['A%'] });
    expect(
      compile({
        kind: 'like',
        target: firstName,
        pattern: '%a%',
        caseInsensitive: true,
      }).where,
    ).toBe('"contacts"."first_name" ilike $1');
  });

  it('binds array operands as one parameter', () => {
    const tags = column('tags', 'array');
    expect(
      compile({
        kind: 'array',
        target: tags,
        operator: 'contains',
        values: ['a', 'b'],
      }),
    ).toEqual({ where: '"contacts"."tags" @> $1', parameters: [['a', 'b']] });
    expect(
      compile({
        kind: 'array',
        target: tags,
        operator: 'containedBy',
        values: [],
      }).where,
    ).toBe('"contacts"."tags" <@ $1');
    expect(
      compile({
        kind: 'array',
        target: tags,
        operator: 'overlaps',
        values: ['a'],
      }).where,
    ).toBe('"contacts"."tags" && $1');
  });

  it('combines with and, or, not, and renders literals', () => {
    const gt: Predicate = {
      kind: 'compare',
      target: age,
      operator: '>',
      value: 1,
    };
    const lt: Predicate = {
      kind: 'compare',
      target: age,
      operator: '<',
      value: 9,
    };
    expect(compile({ kind: 'and', items: [gt, lt] })).toEqual({
      where: '("contacts"."age" > $1 and "contacts"."age" < $2)',
      parameters: [1, 9],
    });
    expect(
      compile({ kind: 'or', items: [gt, { kind: 'not', item: lt }] }).where,
    ).toBe('("contacts"."age" > $1 or not "contacts"."age" < $2)');
    expect(compile({ kind: 'literal', value: true }).where).toBe('true');
    expect(compile({ kind: 'literal', value: false }).where).toBe('false');
    expect(compile({ kind: 'and', items: [] }).where).toBe('true');
    expect(compile({ kind: 'or', items: [] }).where).toBe('false');
  });

  it('renders exists over the relation, correlated on every join pair', () => {
    const relation = contacts.definition.relations.get('emails')!;
    expect(
      compile({
        kind: 'exists',
        relation,
        predicate: {
          kind: 'like',
          target: {
            kind: 'column',
            table: 'contact_emails',
            column: 'email',
            type: 'text',
            lower: false,
          },
          pattern: '%@x.io',
          caseInsensitive: false,
        },
      }),
    ).toEqual({
      where:
        'exists (select 1 as "one" from "contact_emails" where "contact_emails"."contact_id" = "contacts"."id" and "contact_emails"."email" like $1)',
      parameters: ['%@x.io'],
    });
    expect(compile({ kind: 'exists', relation, predicate: null }).where).toBe(
      'exists (select 1 as "one" from "contact_emails" where "contact_emails"."contact_id" = "contacts"."id")',
    );
  });

  it('renders text search over columns or a vector with the configuration as a literal', () => {
    expect(
      compile({
        kind: 'textSearch',
        table: 'contacts',
        source: { columns: ['first_name', 'last_name'] },
        mode: 'websearch',
        config: 'simple',
        term: 'ada -lovelace',
      }),
    ).toEqual({
      where: `to_tsvector('simple', concat_ws(' ', "contacts"."first_name", "contacts"."last_name")) @@ websearch_to_tsquery('simple', $1)`,
      parameters: ['ada -lovelace'],
    });
    expect(
      compile({
        kind: 'textSearch',
        table: 'contacts',
        source: { vector: 'search_vector' },
        mode: 'plain',
        config: 'english',
        term: 'ada',
      }).where,
    ).toBe(`"contacts"."search_vector" @@ plainto_tsquery('english', $1)`);
    expect(
      compile({
        kind: 'textSearch',
        table: 'contacts',
        source: { vector: 'search_vector' },
        mode: 'phrase',
        config: 'simple',
        term: 'ada',
      }).where,
    ).toContain('phraseto_tsquery');
  });
});
