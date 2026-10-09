/**
 * A definition every unit test can share: one table with every field
 * type, two relations, an aggregate per relation, and `like` search.
 */
import type { Keyset } from '../definition/define-keyset';
import type { KeysetDefinition } from '../definition/types';

import { defineKeyset } from '../definition/define-keyset';

/** 36 bytes: above the HMAC-SHA256 minimum. */
export const SECRET = 'test-secret-with-at-least-32-bytes!!';
export const OTHER_SECRET = 'another-secret-with-at-least-32-bytes';

export const CONTACTS = {
  table: 'contacts',
  key: ['id'],
  fields: {
    id: { column: 'id', type: 'uuid' },
    firstName: { column: 'first_name', type: 'text' },
    lastName: {
      column: 'last_name',
      type: 'text',
      collation: 'insensitive',
      nullable: true,
    },
    age: { column: 'age', type: 'integer', nullable: true },
    score: { column: 'score', type: 'decimal' },
    active: { column: 'active', type: 'boolean' },
    status: { column: 'status', type: 'enum', values: ['lead', 'customer'] },
    tags: { column: 'tags', type: 'array', of: 'text' },
    createdAt: { column: 'created_at', type: 'timestamptz' },
    birthday: { column: 'birthday', type: 'date', nullable: true },
    bio: { column: 'bio', type: 'text', sortable: false },
    emailCount: {
      aggregate: { relation: 'emails', fn: 'count' },
      type: 'bigint',
    },
    latestStart: {
      aggregate: { relation: 'workHistory', fn: 'max', column: 'start_date' },
      type: 'date',
    },
  },
  relations: {
    emails: {
      table: 'contact_emails',
      on: { contact_id: 'id' },
      fields: {
        email: { column: 'email', type: 'text' },
        primary: { column: 'is_primary', type: 'boolean' },
      },
    },
    workHistory: {
      table: 'work_history',
      on: { contact_id: 'id' },
      fields: { company: { column: 'company', type: 'text' } },
    },
  },
  search: { mode: 'like', columns: ['first_name', 'last_name'] },
  page: { range: true },
  cursor: { secret: 'test-secret-with-at-least-32-bytes!!' },
} as const;

export const contacts: Keyset<
  typeof CONTACTS.fields,
  typeof CONTACTS.relations
> = defineKeyset(CONTACTS);

export const definition: KeysetDefinition = contacts.definition;

/** What `fn` throws, or `undefined` when it returns. */
export function thrown(fn: () => unknown): unknown {
  try {
    fn();
  } catch (error) {
    return error;
  }
  return undefined;
}

/** What `promise` rejects with, or `undefined` when it resolves. */
export async function rejected(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  return undefined;
}
