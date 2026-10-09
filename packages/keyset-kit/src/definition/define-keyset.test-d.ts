import type { Filter } from '../filter/types';
import type { KeysetRequest } from '../plan/plan';
import type { CONTACTS } from '../test-support/fixtures';
import type { Keyset } from './define-keyset';
import type { RelationFieldPath, SortableFieldOf } from './types';

import { describe, expectTypeOf, it } from 'vitest';

import { contacts } from '../test-support/fixtures';
import { defineKeyset } from './define-keyset';

type Fields = typeof CONTACTS.fields;
type Relations = typeof CONTACTS.relations;
type Request = Parameters<typeof contacts.plan>[0];
type Sort = NonNullable<Request['sort']>;
type ContactFilter = NonNullable<Request['filter']>;

describe('defineKeyset types', () => {
  it('infers the sortable fields: no array fields, no sortable: false', () => {
    expectTypeOf<SortableFieldOf<Fields>>().toEqualTypeOf<
      | 'id'
      | 'firstName'
      | 'lastName'
      | 'age'
      | 'score'
      | 'active'
      | 'status'
      | 'createdAt'
      | 'birthday'
      | 'emailCount'
      | 'latestStart'
    >();
  });

  it('infers relation field paths', () => {
    expectTypeOf<RelationFieldPath<Relations>>().toEqualTypeOf<
      'emails.email' | 'emails.primary' | 'workHistory.company'
    >();
  });

  it('types the request of the returned keyset', () => {
    expectTypeOf(contacts).toEqualTypeOf<Keyset<Fields, Relations>>();
    expectTypeOf<Request>().toEqualTypeOf<
      KeysetRequest<
        SortableFieldOf<Fields>,
        keyof Fields | RelationFieldPath<Relations>,
        {
          readonly emails: 'email' | 'primary';
          readonly workHistory: 'company';
        }
      >
    >();
  });

  it('accepts sort strings, prefixed strings, and objects over sortable fields', () => {
    const ok: Sort = ['-createdAt', 'id', { field: 'age', direction: 'desc' }];
    void ok;
    // @ts-expect-error bio is not sortable
    const unsortable: Sort = ['bio'];
    // @ts-expect-error tags is an array field
    const array: Sort = ['-tags'];
    // @ts-expect-error unknown field
    const unknown: Sort = [{ field: 'nope', direction: 'asc' }];
    void [unsortable, array, unknown];
  });

  it('accepts filters over fields, relation paths, and relation nodes', () => {
    const ok: ContactFilter = {
      and: [
        { field: 'firstName', op: 'containsi', value: 'al' },
        { field: 'emails.email', op: 'endsWith', value: '@example.com' },
        { not: { field: 'age', op: 'isNull' } },
        {
          relation: 'emails',
          some: { or: [{ field: 'primary', op: 'eq', value: true }] },
        },
      ],
    };
    void ok;
    // @ts-expect-error unknown field
    const unknownField: ContactFilter = { field: 'nope', op: 'eq', value: 1 };
    // @ts-expect-error unknown relation path
    const unknownPath: ContactFilter = { field: 'phones.number', op: 'eq' };
    // @ts-expect-error unknown relation
    const unknownRelation: ContactFilter = { relation: 'phones', some: {} };
    // @ts-expect-error a relation node's fields are the relation's
    const wrongScope: ContactFilter = {
      relation: 'emails',
      some: { field: 'firstName', op: 'eq', value: 'x' },
    };
    void [unknownField, unknownPath, unknownRelation, wrongScope];
  });

  it('rejects relation filters on a keyset without relations', () => {
    const items = defineKeyset({
      table: 'items',
      key: ['id'],
      fields: { id: { column: 'id', type: 'integer' } },
      cursor: { secret: 'x'.repeat(32) },
    });
    type ItemFilter = NonNullable<Parameters<typeof items.plan>[0]['filter']>;
    const ok: ItemFilter = { field: 'id', op: 'gt', value: 1 };
    void ok;
    // @ts-expect-error no relations are declared
    const relation: ItemFilter = { relation: 'emails', some: {} };
    void relation;
  });

  it('leaves the untyped filter open to any field and relation', () => {
    expectTypeOf<Filter>().toEqualTypeOf<
      Filter<string, Readonly<Record<string, string>>>
    >();
    const open: Filter = {
      relation: 'anything',
      some: { field: 'x', op: 'eq' },
    };
    void open;
  });
});
