import { describe, expect, it } from 'vitest';

import { operatorsFor } from '../filter/operators';
import { thrown } from '../test-support/fixtures';
import { assertName, normalizeFields } from './normalize-fields';
import { normalizeRelations } from './normalize-relations';

const NO_RELATIONS = normalizeRelations();

function message(fn: () => unknown): string {
  const error = thrown(fn);
  expect(error).toBeInstanceOf(TypeError);
  return (error as TypeError).message;
}

describe('normalizeFields', () => {
  it('fills the defaults of a column field', () => {
    const fields = normalizeFields(
      { name: { column: 'name', type: 'text' } },
      NO_RELATIONS,
    );
    expect(fields.get('name')).toEqual({
      kind: 'column',
      name: 'name',
      column: 'name',
      type: 'text',
      nullable: false,
      sortable: true,
      operators: operatorsFor('text', false),
      values: null,
      of: null,
      collation: 'default',
    });
  });

  it('adds isNull to nullable fields and narrows operators on request', () => {
    const fields = normalizeFields(
      {
        age: { column: 'age', type: 'integer', nullable: true },
        name: { column: 'name', type: 'text', operators: ['eq', 'containsi'] },
      },
      NO_RELATIONS,
    );
    expect(fields.get('age')?.operators.has('isNull')).toBe(true);
    expect([...(fields.get('name')?.operators ?? [])]).toEqual([
      'eq',
      'containsi',
    ]);
  });

  it('rejects operators the type does not accept', () => {
    expect(
      message(() =>
        normalizeFields(
          { age: { column: 'age', type: 'integer', operators: ['contains'] } },
          NO_RELATIONS,
        ),
      ),
    ).toBe(
      'fields.age.operators contains an operator the field\'s type does not accept: "contains"',
    );
    expect(
      message(() =>
        normalizeFields(
          { age: { column: 'age', type: 'integer', operators: ['isNull'] } },
          NO_RELATIONS,
        ),
      ),
    ).toContain('fields.age.operators');
    expect(
      message(() =>
        normalizeFields(
          { age: { column: 'age', type: 'integer', operators: 'eq' } },
          NO_RELATIONS,
        ),
      ),
    ).toBe('fields.age.operators must be an array');
  });

  it('requires enum labels and an array element type', () => {
    const fields = normalizeFields(
      {
        status: { column: 'status', type: 'enum', values: ['a', 'b'] },
        tags: { column: 'tags', type: 'array', of: 'text' },
      },
      NO_RELATIONS,
    );
    expect(fields.get('status')).toMatchObject({ values: ['a', 'b'] });
    expect(fields.get('tags')).toMatchObject({ of: 'text', sortable: false });
    expect(
      message(() =>
        normalizeFields({ s: { column: 's', type: 'enum' } }, NO_RELATIONS),
      ),
    ).toBe('fields.s.values must be a non-empty array of distinct strings');
    expect(
      message(() =>
        normalizeFields(
          { s: { column: 's', type: 'enum', values: ['a', 'a'] } },
          NO_RELATIONS,
        ),
      ),
    ).toContain('distinct');
    expect(
      message(() =>
        normalizeFields(
          { s: { column: 's', type: 'enum', values: ['a', 1] } },
          NO_RELATIONS,
        ),
      ),
    ).toBe('fields.s.values must contain strings only');
    expect(
      message(() =>
        normalizeFields({ t: { column: 't', type: 'array' } }, NO_RELATIONS),
      ),
    ).toBe('fields.t.of must be a scalar field type other than enum');
    expect(
      message(() =>
        normalizeFields(
          { t: { column: 't', type: 'array', of: 'enum' } },
          NO_RELATIONS,
        ),
      ),
    ).toContain('fields.t.of');
    expect(
      message(() =>
        normalizeFields(
          { t: { column: 't', type: 'array', of: 'text', sortable: true } },
          NO_RELATIONS,
        ),
      ),
    ).toBe('fields.t.sortable must be false for an array field');
  });

  it('allows the insensitive collation on text only', () => {
    const fields = normalizeFields(
      { name: { column: 'name', type: 'text', collation: 'insensitive' } },
      NO_RELATIONS,
    );
    expect(fields.get('name')).toMatchObject({ collation: 'insensitive' });
    expect(
      message(() =>
        normalizeFields(
          { age: { column: 'age', type: 'integer', collation: 'insensitive' } },
          NO_RELATIONS,
        ),
      ),
    ).toBe('fields.age.collation applies to text fields only');
    expect(
      message(() =>
        normalizeFields(
          { name: { column: 'name', type: 'text', collation: 'en' } },
          NO_RELATIONS,
        ),
      ),
    ).toBe('fields.name.collation must be "default" or "insensitive"');
  });

  it('names the option of every malformed member', () => {
    expect(message(() => normalizeFields(undefined, NO_RELATIONS))).toBe(
      'fields must be an object',
    );
    expect(message(() => normalizeFields({}, NO_RELATIONS))).toBe(
      'fields must declare at least one field',
    );
    expect(message(() => normalizeFields({ a: 'text' }, NO_RELATIONS))).toBe(
      'fields.a must be an object',
    );
    expect(
      message(() => normalizeFields({ a: { type: 'text' } }, NO_RELATIONS)),
    ).toBe('fields.a.column must be a non-empty string');
    expect(
      message(() =>
        normalizeFields({ a: { column: 'a', type: 'json' } }, NO_RELATIONS),
      ),
    ).toBe('fields.a.type is not a field type: "json"');
    expect(
      message(() =>
        normalizeFields(
          { a: { column: 'a', type: 'text', nullable: 'yes' } },
          NO_RELATIONS,
        ),
      ),
    ).toBe('fields.a.nullable must be a boolean');
  });

  it('rejects names that are not identifiers or alias the prototype', () => {
    expect(
      message(() =>
        normalizeFields(
          { 'bad name': { column: 'a', type: 'text' } },
          NO_RELATIONS,
        ),
      ),
    ).toContain('a field name must match');
    expect(
      message(() =>
        normalizeFields(
          { '-lead': { column: 'a', type: 'text' } },
          NO_RELATIONS,
        ),
      ),
    ).toContain('a field name must match');
    expect(
      message(() =>
        normalizeFields(
          { constructor: { column: 'a', type: 'text' } },
          NO_RELATIONS,
        ),
      ),
    ).toBe('fields must declare at least one field');
    expect(
      thrown(() => {
        assertName('x', 'first-name_2');
      }),
    ).toBeUndefined();
  });

  it('ignores prototype keys injected through JSON', () => {
    const fields = normalizeFields(
      JSON.parse(
        '{"__proto__": {"column": "x", "type": "text"}, "a": {"column": "a", "type": "text"}}',
      ),
      NO_RELATIONS,
    );
    expect([...fields.keys()]).toEqual(['a']);
  });
});
